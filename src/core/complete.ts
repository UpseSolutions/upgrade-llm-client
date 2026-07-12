import { CompleteParams, CompletionResult, TokenUsage } from './types';
import { completeAnthropic, streamAnthropic } from './adapters/anthropic';
import { completeOpenAICompatible, streamOpenAICompatible } from './adapters/openaiCompatible';

export async function complete(params: CompleteParams): Promise<CompletionResult> {
  if (params.provider === 'anthropic') return completeAnthropic(params);
  return completeOpenAICompatible(params.provider, params);
}

// AsyncGenerator que devolve o TokenUsage final via `return` — o wrapper de
// reporte (usage/reportStream.ts) consome isso sem duplicar a lógica de
// parsing de cada provedor.
export function completeStream(params: CompleteParams): AsyncGenerator<unknown, TokenUsage, void> {
  if (params.provider === 'anthropic') return streamAnthropic(params);
  return streamOpenAICompatible(params.provider, params);
}
