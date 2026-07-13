import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { CompleteParams, CompletionResult, Provider, TokenUsage } from '../types';

// groq-sdk espelha a mesma interface chat.completions.create da OpenAI —
// um único adapter cobre os dois provedores (evita duplicar a mesma lógica
// duas vezes, ver services/groq.ts do AlfabetIA que já seguia esse padrão
// de fato mesmo sem compartilhar código entre os dois clients). O cast pro
// tipo OpenAI é seguro em runtime (mesma forma estrutural), só existe
// porque TS não resolve overloads de um union OpenAI | Groq.
function getClient(provider: 'openai' | 'groq', apiKey: string): OpenAI {
  return provider === 'openai' ? new OpenAI({ apiKey }) : (new Groq({ apiKey }) as unknown as OpenAI);
}

function buildMessages(params: CompleteParams) {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string | unknown[] }[] = [];
  if (params.system) messages.push({ role: 'system', content: params.system });
  for (const m of params.messages) messages.push({ role: m.role, content: m.content });
  return messages;
}

export async function completeOpenAICompatible(
  provider: Extract<Provider, 'openai' | 'groq'>,
  params: CompleteParams,
): Promise<CompletionResult> {
  const client = getClient(provider, params.apiKey);
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

// Passthrough de streaming — só funciona pra OpenAI de verdade (Groq não
// devolve `usage` no stream mesmo com stream_options.include_usage; nesse
// caso o reporter grava tokens=0 e quem chama ainda recebe o stream
// intacto, só sem visibilidade de custo nesta chamada).
export async function* streamOpenAICompatible(
  provider: Extract<Provider, 'openai' | 'groq'>,
  params: CompleteParams,
): AsyncGenerator<OpenAI.ChatCompletionChunk, TokenUsage, void> {
  const client = getClient(provider, params.apiKey);
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

  return usage;
}
