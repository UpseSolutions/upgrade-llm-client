import { Product, ProviderId, TokenUsage } from '../core/types';

export interface ReporterConfig {
  product: Product;
  collectorUrl: string;
  collectorApiKey: string;
}

export interface UsageEvent {
  feature: string;
  provider: ProviderId;
  model: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached?: number;
  /** Gravados no cache de prompt, por duração — o coletor cobra 1,25× e 2× a entrada. */
  tokensCacheWrite5m?: number;
  tokensCacheWrite1h?: number;
  /** Segundos de áudio transcrito — o Whisper é cobrado por minuto. */
  audioSeconds?: number;
  /** Unidades do provedor (megapixel, segundo de vídeo, caractere). */
  units?: number;
  costUsdEstimated?: number;
  latencyMs?: number;
  success: boolean;
  errorType?: string;
  fallbackTriggered?: boolean;
  fallbackFromProvider?: ProviderId;
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

export function usageFromTokenUsage(
  usage: TokenUsage,
): Pick<UsageEvent, 'tokensIn' | 'tokensOut' | 'tokensCached' | 'tokensCacheWrite5m' | 'tokensCacheWrite1h'> {
  return {
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    tokensCached: usage.cachedTokens,
    ...(usage.cacheWrite5mTokens ? { tokensCacheWrite5m: usage.cacheWrite5mTokens } : {}),
    ...(usage.cacheWrite1hTokens ? { tokensCacheWrite1h: usage.cacheWrite1hTokens } : {}),
  };
}
