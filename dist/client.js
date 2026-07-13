"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClient = void 0;
const complete_1 = require("./core/complete");
const cascade_1 = require("./fallback/cascade");
const reporter_1 = require("./usage/reporter");
class LLMClient {
    constructor(config) {
        if (config.collectorUrl && config.collectorApiKey) {
            this.reporterConfig = {
                product: config.product,
                collectorUrl: config.collectorUrl,
                collectorApiKey: config.collectorApiKey,
            };
        }
    }
    async complete(params) {
        const startedAt = Date.now();
        try {
            const result = await (0, complete_1.complete)(params);
            (0, reporter_1.reportUsage)(this.reporterConfig, {
                feature: params.feature,
                provider: params.provider,
                model: params.model,
                ...(0, reporter_1.usageFromTokenUsage)(result.usage),
                latencyMs: Date.now() - startedAt,
                success: true,
                streaming: false,
            });
            return result;
        }
        catch (err) {
            (0, reporter_1.reportUsage)(this.reporterConfig, {
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
    async *completeStream(params) {
        const startedAt = Date.now();
        let usage = { inputTokens: 0, outputTokens: 0 };
        try {
            const gen = (0, complete_1.completeStream)(params);
            let next = await gen.next();
            while (!next.done) {
                yield next.value;
                next = await gen.next();
            }
            usage = next.value.usage;
            params.onFinalMessage?.(next.value.raw);
            (0, reporter_1.reportUsage)(this.reporterConfig, {
                feature: params.feature,
                provider: params.provider,
                model: params.model,
                ...(0, reporter_1.usageFromTokenUsage)(usage),
                latencyMs: Date.now() - startedAt,
                success: true,
                streaming: true,
            });
        }
        catch (err) {
            (0, reporter_1.reportUsage)(this.reporterConfig, {
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
    async completeWithFallback(config, params) {
        const startedAt = Date.now();
        try {
            const result = await (0, cascade_1.completeWithFallback)(config, params);
            (0, reporter_1.reportUsage)(this.reporterConfig, {
                feature: params.feature,
                provider: result.providerUsed,
                model: result.modelUsed,
                ...(0, reporter_1.usageFromTokenUsage)(result.usage),
                latencyMs: Date.now() - startedAt,
                success: true,
                fallbackTriggered: result.fallbackTriggered,
                fallbackFromProvider: result.fallbackFromProvider,
                streaming: false,
            });
            return result;
        }
        catch (err) {
            (0, reporter_1.reportUsage)(this.reporterConfig, {
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
}
exports.LLMClient = LLMClient;
//# sourceMappingURL=client.js.map