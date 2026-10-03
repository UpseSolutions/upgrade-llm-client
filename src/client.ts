import { complete, completeStream } from './core/complete';
import { completeWithFallback, FallbackConfig } from './fallback/cascade';
import { CompleteParams, CompletionResult, TokenUsage } from './core/types';
import { reportUsage, ReporterConfig, usageFromTokenUsage } from './usage/reporter';
import {
  generateImageRaw,
  GenerateImageParams,
  ImageResult,
  transcribeRaw,
  TranscribeParams,
  TranscriptionResult,
} from './core/media';

export interface LLMClientConfig {
  product: ReporterConfig['product'];
  // Sem essas duas, o client funciona normalmente e só não reporta uso —
  // nunca é obrigatório configurar o coletor pra usar a lib.
  collectorUrl?: string;
  collectorApiKey?: string;
}

// A lib nunca lê env var sozinha (ver plano) — tudo entra por parâmetro,
// quem instancia decide de onde vêm as chaves.
/** O que um provedor cobra por uma chamada. Ausente = 0. */
export interface Consumo {
  tokensIn?: number;
  tokensOut?: number;
  tokensCached?: number;
  audioSeconds?: number;
  /** Unidade do modelo no coletor: megapixel, segundo de vídeo, caractere. */
  units?: number;
}

export class LLMClient {
  private reporterConfig?: ReporterConfig;

  constructor(config: LLMClientConfig) {
    if (config.collectorUrl && config.collectorApiKey) {
      this.reporterConfig = {
        product: config.product,
        collectorUrl: config.collectorUrl,
        collectorApiKey: config.collectorApiKey,
      };
    }
  }

  async complete(params: CompleteParams): Promise<CompletionResult> {
    const startedAt = Date.now();
    try {
      const result = await complete(params);
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        ...usageFromTokenUsage(result.usage),
        latencyMs: Date.now() - startedAt,
        success: true,
        streaming: false,
      });
      return result;
    } catch (err) {
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorType: 'other',
        streaming: false,
      });
      throw err;
    }
  }

  // Passthrough puro — cada chunk nativo do provedor é repassado sem
  // alteração, na mesma ordem, assim que chega. Só ao final (stream
  // esgotado ou erro) é que o reporte de uso dispara.
  async *completeStream(params: CompleteParams): AsyncGenerator<unknown, void, void> {
    const startedAt = Date.now();
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    try {
      const gen = completeStream(params);
      let next = await gen.next();
      while (!next.done) {
        yield next.value;
        next = await gen.next();
      }
      usage = next.value.usage;
      params.onFinalMessage?.(next.value.raw);
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        ...usageFromTokenUsage(usage),
        latencyMs: Date.now() - startedAt,
        success: true,
        streaming: true,
      });
    } catch (err) {
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        tokensIn: usage.inputTokens,
        tokensOut: usage.outputTokens,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorType: 'other',
        streaming: true,
      });
      throw err;
    }
  }

  async completeWithFallback(
    config: FallbackConfig,
    params: Omit<CompleteParams, 'provider' | 'apiKey' | 'model'>,
  ): Promise<CompletionResult & { providerUsed: string; fallbackTriggered: boolean }> {
    const startedAt = Date.now();
    try {
      const result = await completeWithFallback(config, params);
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: result.providerUsed,
        model: result.modelUsed,
        ...usageFromTokenUsage(result.usage),
        latencyMs: Date.now() - startedAt,
        success: true,
        fallbackTriggered: result.fallbackTriggered,
        fallbackFromProvider: result.fallbackFromProvider,
        streaming: false,
      });
      return result;
    } catch (err) {
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: config.steps[0].provider,
        model: config.steps[0].model,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorType: 'other',
        streaming: false,
      });
      throw err;
    }
  }

  /** Gera uma imagem e reporta os tokens (prompt na entrada, imagem na saída). */
  async generateImage(params: GenerateImageParams): Promise<ImageResult> {
    return this.measure(params, () => generateImageRaw(params), (r) => ({
      ...usageFromTokenUsage(r.usage),
    }));
  }

  /**
   * Transcreve áudio e reporta a DURAÇÃO — o Whisper é cobrado por minuto, e o
   * coletor precifica por `audioSeconds`.
   */
  async transcribe(params: TranscribeParams): Promise<TranscriptionResult> {
    return this.measure(params, () => transcribeRaw(params), (r) => ({
      ...usageFromTokenUsage(r.usage),
      audioSeconds: r.audioSeconds,
    }));
  }

  /**
   * Mede uma chamada a provedor que a lib não fala (fal, ElevenLabs...) e
   * reporta o consumo ao coletor, no mesmo envelope do `complete`: reporta
   * sucesso e falha, nunca engole erro, e o reporte nunca derruba a chamada.
   *
   * `consumo` diz o que o provedor cobra: tokens, segundos de áudio ou
   * `units` — a unidade do modelo (megapixel, segundo de vídeo, caractere),
   * que o coletor precifica pela tabela dele.
   */
  async measure<T>(
    params: { feature: string; provider: string; model: string },
    chamar: () => Promise<T>,
    consumo: (r: T) => Consumo,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await chamar();
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        tokensIn: 0,
        tokensOut: 0,
        ...consumo(result),
        latencyMs: Date.now() - startedAt,
        success: true,
        streaming: false,
      });
      return result;
    } catch (err) {
      reportUsage(this.reporterConfig, {
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startedAt,
        success: false,
        errorType: 'other',
        streaming: false,
      });
      throw err;
    }
  }
}
