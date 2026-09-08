import { CompleteParams, CompletionResult, ProviderId, ProviderSpec } from '../core/types';
export interface FallbackStep {
    provider: ProviderId;
    apiKey: string;
    model: string;
    providerSpec?: ProviderSpec;
}
export interface FallbackConfig {
    useCase: string;
    steps: FallbackStep[];
}
export interface FallbackResult extends CompletionResult {
    providerUsed: ProviderId;
    modelUsed: string;
    fallbackTriggered: boolean;
    fallbackFromProvider?: ProviderId;
}
export declare function completeWithFallback(config: FallbackConfig, params: Omit<CompleteParams, 'provider' | 'apiKey' | 'model'>): Promise<FallbackResult>;
