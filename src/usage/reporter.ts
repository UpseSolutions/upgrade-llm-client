import { Product, Provider, TokenUsage } from '../core/types';

export interface ReporterConfig {
  product: Product;
  collectorUrl: string;
  collectorApiKey: string;
}

export interface UsageEvent {
  feature: string;
  provider: Provider;
  model: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached?: number;
  costUsdEstimated?: number;
  latencyMs?: number;
  success: boolean;
  errorType?: string;
  fallbackTriggered?: boolean;
  fallbackFromProvider?: Provider;
  streaming?: boolean;
}

// Fire-and-forget — nunca lança, nunca atrasa a chamada de IA que originou
// o evento (mesmo padrão do reporter Python do Hadrians e do
// reportToUsageCollector do AgenteUP). Sem config.collectorApiKey, é no-op.
export function reportUsage(config: ReporterConfig | undefined, event: UsageEvent): void {
  if (!config?.collectorApiKey) return;

  fetch(`${config.collectorUrl}/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.collectorApiKey },
    body: JSON.stringify(event),
  }).catch(() => {
    // Engolido de propósito — visibilidade de custo nunca pode derrubar o
    // caminho de resposta de IA do produto que consome a lib.
  });
}

export function usageFromTokenUsage(usage: TokenUsage): Pick<UsageEvent, 'tokensIn' | 'tokensOut' | 'tokensCached'> {
  return {
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    tokensCached: usage.cachedTokens,
  };
}
