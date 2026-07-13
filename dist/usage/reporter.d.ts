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
export declare function reportUsage(config: ReporterConfig | undefined, event: UsageEvent): void;
export declare function usageFromTokenUsage(usage: TokenUsage): Pick<UsageEvent, 'tokensIn' | 'tokensOut' | 'tokensCached'>;
