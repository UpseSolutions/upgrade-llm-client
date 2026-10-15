import Anthropic from '@anthropic-ai/sdk';
import { CompleteParams, CompletionResult, TokenUsage } from '../types';

// Força fetch nativo do Node (18+) — achado real num consumidor da lib
// (ContentSeller, agente Seller/SDR): o SDK sem essa opção pode cair no
// node-fetch@2.x vendorizado, que solta "Premature close" em streams
// longos (loop agêntico de várias rodadas). Sem contrapartida conhecida,
// vira padrão da lib em vez de opção — mesma correção que o ContentSeller
// já aplicava manualmente antes de existir a lib.
// baseURL sai do spec quando existe. Não é hipótese: gateways e provedores que
// implementam a Messages API da Anthropic (a Moonshot anunciou isso em 09/2026)
// passam a ser alcançáveis sem tocar aqui de novo.
function newAnthropicClient(apiKey: string, baseUrl?: string): Anthropic {
  return new Anthropic({ apiKey, baseURL: baseUrl, fetch: globalThis.fetch as any });
}

// A resposta real da API inclui cache_read_input_tokens e
// cache_creation_input_tokens (prompt caching), mas os tipos estáveis desta
// versão do SDK ainda não expõem os campos — só a superfície beta expõe.
// Runtime tem os campos, só o tipo não.
type UsageWithCache = Anthropic.Usage & {
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  // Por duração (documentação de prompt caching): a soma é cache_creation_input_tokens.
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

/**
 * Uso da Anthropic no formato da lib.
 *
 * `input_tokens` da API NÃO inclui nem o cache lido nem o gravado — são três
 * contas separadas. Até 02/10/2026 o gravado se perdia; de 02 a 15/10 ia somado
 * à entrada (1,0×). Desde 15/10/2026 vai separado por duração — o coletor
 * (`tokensCacheWrite5m`/`tokensCacheWrite1h`) cobra 1,25× e 2× a entrada. Com o
 * cache de 1 hora no Seller (ContentSeller), somar à entrada erraria 50% nessa
 * parcela. Sem o detalhe por duração (resposta antiga), tudo conta como 5 min.
 */
export function usoDaAnthropic(
  u: UsageWithCache,
): Pick<TokenUsage, 'inputTokens' | 'cachedTokens' | 'cacheWriteTokens' | 'cacheWrite5mTokens' | 'cacheWrite1hTokens'> {
  const gravados = u.cache_creation_input_tokens ?? 0;
  const uma = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const cinco = u.cache_creation ? u.cache_creation.ephemeral_5m_input_tokens ?? 0 : gravados;
  return {
    inputTokens: u.input_tokens ?? 0,
    cachedTokens: u.cache_read_input_tokens ?? undefined,
    ...(gravados > 0 ? { cacheWriteTokens: gravados } : {}),
    ...(cinco > 0 ? { cacheWrite5mTokens: cinco } : {}),
    ...(uma > 0 ? { cacheWrite1hTokens: uma } : {}),
  };
}

export async function completeAnthropic(params: CompleteParams): Promise<CompletionResult> {
  const client = newAnthropicClient(params.apiKey, params.providerSpec?.baseUrl);
  const response = await client.messages.create(
    {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: params.system,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })) as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[] | undefined,
    },
    { signal: params.signal },
  );

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');

  return {
    text: textBlock?.text ?? '',
    usage: {
      ...usoDaAnthropic(response.usage as UsageWithCache),
      outputTokens: response.usage.output_tokens,
    },
    raw: response,
  };
}

export interface StreamResult {
  usage: TokenUsage;
  // Mensagem final reconstruída pelo próprio SDK da Anthropic
  // (stream.finalMessage() — não é a lib reimplementando acúmulo de
  // deltas). Necessário pra loop agêntico com tools durante streaming:
  // sem os content blocks completos (incl. tool_use), quem chama não
  // consegue montar o próximo turno da conversa nem saber se deve
  // continuar (stop_reason). undefined pra OpenAI/Groq — sem equivalente
  // nativo, não reimplementado aqui pelos mesmos motivos.
  raw: Anthropic.Message;
}

// Passthrough — não reimplementa o streaming da Anthropic. Repassa cada
// evento nativo intacto e só observa o evento final (message_delta com
// usage cumulativo) pra extrair os tokens, sem alterar nada do que o
// consumidor recebe.
export async function* streamAnthropic(
  params: CompleteParams,
): AsyncGenerator<Anthropic.MessageStreamEvent, StreamResult, void> {
  const client = newAnthropicClient(params.apiKey, params.providerSpec?.baseUrl);
  const stream = client.messages.stream(
    {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      system: params.system,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })) as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[] | undefined,
    },
    { signal: params.signal },
  );

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for await (const event of stream) {
    if (event.type === 'message_start') {
      usage = { ...usage, ...usoDaAnthropic(event.message.usage as UsageWithCache) };
    }
    if (event.type === 'message_delta') {
      usage.outputTokens = event.usage.output_tokens;
    }
    yield event;
  }

  const finalMessage = await stream.finalMessage();
  return { usage, raw: finalMessage };
}
