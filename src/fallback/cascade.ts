import { complete } from '../core/complete';
import { CompleteParams, CompletionResult, Provider } from '../core/types';
import { isRetryable } from './isRetryable';

export interface FallbackStep {
  provider: Provider;
  apiKey: string;
  model: string;
}

export interface FallbackConfig {
  // Nome do caso de uso — identifica a cascata (ex: "kit_generation"), não
  // existe cascata global default (cada caso de uso declara a sua, mesmo
  // que seja de 1 elemento só — ver plano).
  useCase: string;
  steps: FallbackStep[];
}

export interface FallbackResult extends CompletionResult {
  providerUsed: Provider;
  modelUsed: string;
  fallbackTriggered: boolean;
  fallbackFromProvider?: Provider;
}

// Um hop por camada: tenta step[0], se for erro retryable tenta step[1], e
// assim por diante. Erro não-retryable (ex: 400 de validação) propaga
// imediatamente, sem passar pros próximos steps — cascata existe pra
// indisponibilidade de provedor, não pra mascarar bug de request.
export async function completeWithFallback(
  config: FallbackConfig,
  params: Omit<CompleteParams, 'provider' | 'apiKey' | 'model'>,
): Promise<FallbackResult> {
  if (config.steps.length === 0) {
    throw new Error(`FallbackConfig "${config.useCase}" não tem nenhum step configurado`);
  }

  let lastError: unknown;

  for (let i = 0; i < config.steps.length; i++) {
    const step = config.steps[i];
    try {
      const result = await complete({ ...params, provider: step.provider, apiKey: step.apiKey, model: step.model });
      return {
        ...result,
        providerUsed: step.provider,
        modelUsed: step.model,
        fallbackTriggered: i > 0,
        fallbackFromProvider: i > 0 ? config.steps[0].provider : undefined,
      };
    } catch (err) {
      lastError = err;
      const isLastStep = i === config.steps.length - 1;
      if (!isRetryable(err) || isLastStep) throw err;
    }
  }

  // Inalcançável (o loop sempre retorna ou lança), só satisfaz o compilador.
  throw lastError;
}
