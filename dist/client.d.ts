import { FallbackConfig } from './fallback/cascade';
import { CompleteParams, CompletionResult } from './core/types';
import { ReporterConfig } from './usage/reporter';
import { GenerateImageParams, ImageResult, TranscribeParams, TranscriptionResult } from './core/media';
export interface LLMClientConfig {
    product: ReporterConfig['product'];
    collectorUrl?: string;
    collectorApiKey?: string;
}
export declare class LLMClient {
    private reporterConfig?;
    constructor(config: LLMClientConfig);
    complete(params: CompleteParams): Promise<CompletionResult>;
    completeStream(params: CompleteParams): AsyncGenerator<unknown, void, void>;
    completeWithFallback(config: FallbackConfig, params: Omit<CompleteParams, 'provider' | 'apiKey' | 'model'>): Promise<CompletionResult & {
        providerUsed: string;
        fallbackTriggered: boolean;
    }>;
    generateImage(params: GenerateImageParams): Promise<ImageResult>;
    transcribe(params: TranscribeParams): Promise<TranscriptionResult>;
    private medir;
}
