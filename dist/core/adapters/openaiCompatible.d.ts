import OpenAI from 'openai';
import { CompleteParams, CompletionResult, ProviderSpec, TokenUsage } from '../types';
export declare function completeOpenAICompatible(spec: ProviderSpec, params: CompleteParams): Promise<CompletionResult>;
export interface OpenAIStreamResult {
    usage: TokenUsage;
    raw: undefined;
}
export declare function streamOpenAICompatible(spec: ProviderSpec, params: CompleteParams): AsyncGenerator<OpenAI.ChatCompletionChunk, OpenAIStreamResult, void>;
