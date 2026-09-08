import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { CompleteParams, CompletionResult, ProviderSpec, TokenUsage } from '../types';

// groq-sdk espelha a mesma interface chat.completions.create da OpenAI —
// um único adapter cobre os dois provedores (evita duplicar a mesma lógica
// duas vezes, ver services/groq.ts do AlfabetIA que já seguia esse padrão
// de fato mesmo sem compartilhar código entre os dois clients). O cast pro
// tipo OpenAI é seguro em runtime (mesma forma estrutural), só existe
// porque TS não resolve overloads de um union OpenAI | Groq.
// fetch nativo forçado pelo mesmo motivo do adapter Anthropic (ver
// newAnthropicClient) — consistência entre os três provedores.
// `baseURL: undefined` é o padrão do SDK — o caminho da OpenAI não muda em
// nada. É essa uma linha que faz DeepSeek, Moonshot, Together, Fireworks e
// OpenRouter passarem a ser configuração em vez de código: todos falam a mesma
// API, só noutra URL.
function getClient(spec: ProviderSpec, apiKey: string): OpenAI {
  const fetchOpt = { fetch: globalThis.fetch as any };
  if (spec.sdk === 'groq') return new Groq({ apiKey, ...fetchOpt }) as unknown as OpenAI;
  return new OpenAI({ apiKey, baseURL: spec.baseUrl, ...fetchOpt });
}

function buildMessages(params: CompleteParams) {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string | unknown[] }[] = [];
  if (params.system) messages.push({ role: 'system', content: params.system });
  for (const m of params.messages) messages.push({ role: m.role, content: m.content });
  return messages;
}

export async function completeOpenAICompatible(
  spec: ProviderSpec,
  params: CompleteParams,
): Promise<CompletionResult> {
  const client = getClient(spec, params.apiKey);
  const response = await client.chat.completions.create(
    {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: buildMessages(params) as never,
      tools: params.tools as never,
    },
    { signal: params.signal },
  );

  const usage: TokenUsage = {
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    cachedTokens: (response.usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
      ?.prompt_tokens_details?.cached_tokens,
  };

  return {
    text: response.choices[0]?.message?.content ?? '',
    usage,
    raw: response,
  };
}

export interface OpenAIStreamResult {
  usage: TokenUsage;
  // Sem equivalente a stream.finalMessage() da Anthropic no SDK da OpenAI
  // — não reimplementado aqui (ver StreamResult do adapter Anthropic).
  raw: undefined;
}

// Passthrough de streaming — só funciona pra OpenAI de verdade (Groq não
// devolve `usage` no stream mesmo com stream_options.include_usage; nesse
// caso o reporter grava tokens=0 e quem chama ainda recebe o stream
// intacto, só sem visibilidade de custo nesta chamada).
export async function* streamOpenAICompatible(
  spec: ProviderSpec,
  params: CompleteParams,
): AsyncGenerator<OpenAI.ChatCompletionChunk, OpenAIStreamResult, void> {
  const client = getClient(spec, params.apiKey);
  const stream = await client.chat.completions.create(
    {
      model: params.model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: buildMessages(params) as never,
      tools: params.tools as never,
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal: params.signal },
  );

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for await (const chunk of stream as AsyncIterable<OpenAI.ChatCompletionChunk>) {
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
      };
    }
    yield chunk;
  }

  return { usage, raw: undefined };
}
