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
};

/**
 * Uso da Anthropic no formato da lib.
 *
 * `input_tokens` da API NÃO inclui nem o cache lido nem o gravado — são três
 * contas separadas. O lido já ia para o coletor (`cachedTokens`); o gravado
 * se perdia, e custa 1,25× a entrada. Medido no ContentSeller (02/10/2026):
 * com cache ligado no agente, o coletor passou a mostrar US$ 0,009 por
 * chamada quando a primeira da sequência, que grava ~55 mil tokens, custava
 * ~US$ 0,21. Somar o gravado à entrada cobra a 1,0× em vez de 1,25× — erro de
 * 25% sobre essa parcela, contra 100% antes —, sem mexer no coletor, que
 * atende todos os produtos.
 */
export function usoDaAnthropic(u: UsageWithCache): Pick<TokenUsage, 'inputTokens' | 'cachedTokens' | 'cacheWriteTokens'> {
  const gravados = u.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: (u.input_tokens ?? 0) + gravados,
    cachedTokens: u.cache_read_input_tokens ?? undefined,
    ...(gravados > 0 ? { cacheWriteTokens: gravados } : {}),
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
