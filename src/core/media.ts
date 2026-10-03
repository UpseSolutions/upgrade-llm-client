import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { TokenUsage } from './types';

// Imagem e transcrição, as duas chamadas de IA que não são texto. Existem na
// lib pelo mesmo motivo do `complete`: é aqui que o custo é reportado ao
// coletor. Antes de 03/10/2026 os produtos chamavam o SDK direto e esse custo
// não aparecia em relatório nenhum.

export interface GenerateImageParams {
  /** Só OpenAI: é quem tem gerador de imagem entre os provedores da lib. */
  provider: 'openai';
  apiKey: string;
  /** gpt-image-*. O dall-e-3 foi desligado em 12/05/2026 e responde 404. */
  model: string;
  prompt: string;
  size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  feature: string;
  signal?: AbortSignal;
}

export interface ImageResult {
  /**
   * A imagem em si. O gpt-image devolve base64, nunca URL — e a URL do
   * dall-e-3 expirava em ~1 h, então quem gravava a URL perdia a imagem.
   * Guardar o arquivo é responsabilidade de quem chama.
   */
  image: Buffer;
  /** Tokens de entrada (prompt) e de saída (a imagem), como o provedor cobra. */
  usage: TokenUsage;
  raw: unknown;
}

export interface TranscribeParams {
  provider: 'openai' | 'groq';
  apiKey: string;
  model: string;
  /** O que o SDK aceita: ReadStream, File, Blob. */
  file: unknown;
  language?: string;
  feature: string;
  signal?: AbortSignal;
}

export interface TranscriptionResult {
  text: string;
  /**
   * Duração do áudio, em segundos — é por ela que o Whisper é cobrado. Zero
   * quando o provedor não informa; o coletor mostra o evento como sem preço.
   */
  audioSeconds: number;
  /** Modelos de transcrição cobrados por token (gpt-*-transcribe) informam aqui. */
  usage: TokenUsage;
  raw: unknown;
}

const fetchOpt = { fetch: globalThis.fetch as any };

export async function generateImageRaw(params: GenerateImageParams): Promise<ImageResult> {
  const client = new OpenAI({ apiKey: params.apiKey, ...fetchOpt });
  const response = await client.images.generate(
    {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size ?? '1024x1024',
      quality: params.quality ?? 'medium',
    },
    { signal: params.signal },
  );

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error(`[llm-client] ${params.model} não devolveu imagem`);

  return {
    image: Buffer.from(b64, 'base64'),
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    raw: response,
  };
}

/**
 * Os Whisper só informam a duração em `verbose_json`; os gpt-*-transcribe não
 * aceitam esse formato e informam tokens em `usage`. Pelo nome é o único jeito
 * de saber antes de chamar.
 */
const cobradoPorMinuto = (model: string) => /whisper/i.test(model);

export async function transcribeRaw(params: TranscribeParams): Promise<TranscriptionResult> {
  // SEM o fetch nativo que o resto da lib força. A transcrição é upload
  // multipart, e o fetch nativo do Node recusa corpo em stream sem a opção
  // `duplex`, que estes SDKs não passam: "Connection error. RequestInit:
  // duplex option is required when sending a body" — com stream E com File.
  // Medido em produção em 03/10/2026, logo depois de a transcrição do
  // Kompetent passar pela lib. O fetch padrão do SDK sobe o arquivo.
  const client =
    params.provider === 'groq'
      ? (new Groq({ apiKey: params.apiKey }) as unknown as OpenAI)
      : new OpenAI({ apiKey: params.apiKey });

  const porMinuto = cobradoPorMinuto(params.model);
  const response = (await client.audio.transcriptions.create(
    {
      file: params.file as any,
      model: params.model,
      language: params.language,
      response_format: porMinuto ? 'verbose_json' : 'json',
    },
    { signal: params.signal },
  )) as unknown as {
    text: string;
    duration?: number;
    usage?: { input_tokens?: number; output_tokens?: number; type?: string; seconds?: number };
  };

  return {
    text: response.text ?? '',
    audioSeconds: Number(response.duration ?? response.usage?.seconds ?? 0) || 0,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    raw: response,
  };
}
