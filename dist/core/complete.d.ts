import { CompleteParams, CompletionResult, ProviderSpec, StreamCompletionResult } from './types';
export declare function providerSpecDe(params: Pick<CompleteParams, 'provider' | 'providerSpec'>): ProviderSpec;
export declare function complete(params: CompleteParams): Promise<CompletionResult>;
export declare function completeStream(params: CompleteParams): AsyncGenerator<unknown, StreamCompletionResult, void>;
