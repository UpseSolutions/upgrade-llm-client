import { CompleteParams, CompletionResult, Provider, ProviderSpec, StreamCompletionResult } from './types';
import { completeAnthropic, streamAnthropic } from './adapters/anthropic';
import { completeOpenAICompatible, streamOpenAICompatible } from './adapters/openaiCompatible';

// Os três provedores originais não precisam declarar spec — é o que mantém
// funcionando todo consumidor escrito antes do registro existir. Qualquer outro
// exige spec, e a falta dela falha na hora, com o nome do provedor: adivinhar
// URL de provedor é o tipo de chute que só se descobre em produção.
const SPEC_PADRAO: Record<Provider, ProviderSpec> = {
  anthropic: { api: 'anthropic' },
  openai: { api: 'openai-compatible' },
  groq: { api: 'openai-compatible', sdk: 'groq' },
};

export function providerSpecDe(params: Pick<CompleteParams, 'provider' | 'providerSpec'>): ProviderSpec {
  const spec = params.providerSpec ?? SPEC_PADRAO[params.provider as Provider];
  if (!spec) {
    throw new Error(
      `Provedor "${params.provider}" não é um dos três nativos e veio sem providerSpec — ` +
        'declare-o em src/models/models.json e passe o spec (resolveRole já devolve).',
    );
  }
  if (!spec.api) {
    throw new Error(
      `Provedor "${params.provider}" está no registro mas este cliente não fala com ele ` +
        '(sem api no spec). Está no catálogo só para ter preço.',
    );
  }
  return spec;
}

export async function complete(params: CompleteParams): Promise<CompletionResult> {
  const spec = providerSpecDe(params);
  if (spec.api === 'anthropic') return completeAnthropic(params);
  return completeOpenAICompatible(spec, params);
}

// AsyncGenerator que devolve { usage, raw } via `return` — o wrapper de
// reporte (client.ts) consome usage sem duplicar a lógica de parsing de
// cada provedor; `raw` (só populado pra Anthropic — stream.finalMessage())
// vai pro callback onFinalMessage de quem chama, pra loop agêntico com
// tools durante streaming.
export function completeStream(params: CompleteParams): AsyncGenerator<unknown, StreamCompletionResult, void> {
  const spec = providerSpecDe(params);
  if (spec.api === 'anthropic') return streamAnthropic(params);
  return streamOpenAICompatible(spec, params);
}
