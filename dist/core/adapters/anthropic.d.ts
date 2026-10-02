import Anthropic from '@anthropic-ai/sdk';
import { CompleteParams, CompletionResult, TokenUsage } from '../types';
type UsageWithCache = Anthropic.Usage & {
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
};
export declare function usoDaAnthropic(u: UsageWithCache): Pick<TokenUsage, 'inputTokens' | 'cachedTokens' | 'cacheWriteTokens'>;
export declare function completeAnthropic(params: CompleteParams): Promise<CompletionResult>;
export interface StreamResult {
    usage: TokenUsage;
    raw: Anthropic.Message;
}
export declare function streamAnthropic(params: CompleteParams): AsyncGenerator<Anthropic.MessageStreamEvent, StreamResult, void>;
export {};
