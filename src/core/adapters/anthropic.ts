import Anthropic from '@anthropic-ai/sdk';
import { CompleteParams, CompletionResult, TokenUsage } from '../types';

// Força fetch nativo do Node (18+) — achado real num consumidor da lib
// (ContentSeller, agente Seller/SDR): o SDK sem essa opção pode cair no
// node-fetch@2.x vendorizado, que solta "Premature close" em streams
// longos (loop agêntico de várias rodadas). Sem contrapartida conhecida,
// vira padrão da lib em vez de opção — mesma correção que o ContentSeller
// já aplicava manualmente antes de existir a lib.
function newAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, fetch: globalThis.fetch as any });
}

// A resposta real da API inclui cache_read_input_tokens (prompt caching),
// mas os tipos estáveis desta versão do SDK ainda não expõem o campo — só
// a superfície beta expõe. Runtime tem o campo, só o tipo não.
type UsageWithCache = Anthropic.Usage & { cache_read_input_tokens?: number | null };

export async function completeAnthropic(params: CompleteParams): Promise<CompletionResult> {
  const client = newAnthropicClient(params.apiKey);
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
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedTokens: (response.usage as UsageWithCache).cache_read_input_tokens ?? undefined,
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
  const client = newAnthropicClient(params.apiKey);
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
      usage.inputTokens = event.message.usage.input_tokens;
      usage.cachedTokens = (event.message.usage as UsageWithCache).cache_read_input_tokens ?? undefined;
    }
    if (event.type === 'message_delta') {
      usage.outputTokens = event.usage.output_tokens;
    }
    yield event;
  }

  const finalMessage = await stream.finalMessage();
  return { usage, raw: finalMessage };
}
