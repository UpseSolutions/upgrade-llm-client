export type Provider = 'anthropic' | 'openai' | 'groq';
export type Product = 'HADRIANS' | 'GOLDANALYZER' | 'ALFABETIA' | 'AGENTEUP' | 'CONTENTSELLER' | 'EMAILSELLER';
export interface LLMMessage {
    role: 'user' | 'assistant';
    content: string | unknown[];
}
export interface CompleteParams {
    provider: Provider;
    apiKey: string;
    model: string;
    messages: LLMMessage[];
    system?: string;
    maxTokens: number;
    temperature?: number;
    tools?: unknown[];
    feature: string;
    signal?: AbortSignal;
    onFinalMessage?: (raw: unknown) => void;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
}
export interface CompletionResult {
    text: string;
    usage: TokenUsage;
    raw: unknown;
}
export interface StreamCompletionResult {
    usage: TokenUsage;
    raw: unknown;
}
