import { CompleteParams, CompletionResult, StreamCompletionResult } from './types';
import { completeAnthropic, streamAnthropic } from './adapters/anthropic';
import { completeOpenAICompatible, streamOpenAICompatible } from './adapters/openaiCompatible';

export async function complete(params: CompleteParams): Promise<CompletionResult> {
  if (params.provider === 'anthropic') return completeAnthropic(params);
  return completeOpenAICompatible(params.provider, params);
}

// AsyncGenerator que devolve { usage, raw } via `return` — o wrapper de
// reporte (client.ts) consome usage sem duplicar a lógica de parsing de
// cada provedor; `raw` (só populado pra Anthropic — stream.finalMessage())
// vai pro callback onFinalMessage de quem chama, pra loop agêntico com
// tools durante streaming.
export function completeStream(params: CompleteParams): AsyncGenerator<unknown, StreamCompletionResult, void> {
  if (params.provider === 'anthropic') return streamAnthropic(params);
  return streamOpenAICompatible(params.provider, params);
}
