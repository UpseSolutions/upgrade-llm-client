"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeWithFallback = completeWithFallback;
const complete_1 = require("../core/complete");
const reserva_1 = require("../core/reserva");
const isRetryable_1 = require("./isRetryable");
async function completeWithFallback(config, params, chamar = complete_1.complete) {
    if (config.steps.length === 0) {
        throw new Error(`FallbackConfig "${config.useCase}" não tem nenhum step configurado`);
    }
    let lastError;
    for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];
        try {
            const result = await chamar({
                ...params,
                provider: step.provider,
                apiKey: step.apiKey,
                model: step.model,
                providerSpec: step.providerSpec,
            });
            return {
                ...result,
                providerUsed: step.provider,
                modelUsed: step.model,
                fallbackTriggered: i > 0,
                fallbackFromProvider: i > 0 ? config.steps[0].provider : undefined,
            };
        }
        catch (err) {
            lastError = err;
            const isLastStep = i === config.steps.length - 1;
            if (!((0, isRetryable_1.isRetryable)(err) || (0, reserva_1.semCredito)(err)) || isLastStep)
                throw err;
        }
    }
    throw lastError;
}
//# sourceMappingURL=cascade.js.map