import { CompleteParams, CompletionResult, StreamCompletionResult } from './types';
export declare function complete(params: CompleteParams): Promise<CompletionResult>;
export declare function completeStream(params: CompleteParams): AsyncGenerator<unknown, StreamCompletionResult, void>;
