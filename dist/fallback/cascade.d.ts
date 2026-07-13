import { CompleteParams, CompletionResult, Provider } from '../core/types';
export interface FallbackStep {
    provider: Provider;
    apiKey: string;
    model: string;
}
export interface FallbackConfig {
    useCase: string;
    steps: FallbackStep[];
}
export interface FallbackResult extends CompletionResult {
    providerUsed: Provider;
    modelUsed: string;
    fallbackTriggered: boolean;
    fallbackFromProvider?: Provider;
}
export declare function completeWithFallback(config: FallbackConfig, params: Omit<CompleteParams, 'provider' | 'apiKey' | 'model'>): Promise<FallbackResult>;
