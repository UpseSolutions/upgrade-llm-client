import OpenAI from 'openai';
import { CompleteParams, CompletionResult, Provider, TokenUsage } from '../types';
export declare function completeOpenAICompatible(provider: Extract<Provider, 'openai' | 'groq'>, params: CompleteParams): Promise<CompletionResult>;
export declare function streamOpenAICompatible(provider: Extract<Provider, 'openai' | 'groq'>, params: CompleteParams): AsyncGenerator<OpenAI.ChatCompletionChunk, TokenUsage, void>;
