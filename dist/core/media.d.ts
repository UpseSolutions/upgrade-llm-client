import { TokenUsage } from './types';
export interface GenerateImageParams {
    provider: 'openai';
    apiKey: string;
    model: string;
    prompt: string;
    size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
    quality?: 'low' | 'medium' | 'high' | 'auto';
    feature: string;
    signal?: AbortSignal;
}
export interface ImageResult {
    image: Buffer;
    usage: TokenUsage;
    raw: unknown;
}
export interface TranscribeParams {
    provider: 'openai' | 'groq';
    apiKey: string;
    model: string;
    file: unknown;
    language?: string;
    feature: string;
    signal?: AbortSignal;
}
export interface TranscriptionResult {
    text: string;
    audioSeconds: number;
    usage: TokenUsage;
    raw: unknown;
}
export declare function generateImageRaw(params: GenerateImageParams): Promise<ImageResult>;
export declare function transcribeRaw(params: TranscribeParams): Promise<TranscriptionResult>;
