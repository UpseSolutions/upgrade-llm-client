import Anthropic from '@anthropic-ai/sdk';
import { CompleteParams, CompletionResult, TokenUsage } from '../types';
export declare function completeAnthropic(params: CompleteParams): Promise<CompletionResult>;
export declare function streamAnthropic(params: CompleteParams): AsyncGenerator<Anthropic.MessageStreamEvent, TokenUsage, void>;
