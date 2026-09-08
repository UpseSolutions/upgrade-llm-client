"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerSpecDe = providerSpecDe;
exports.complete = complete;
exports.completeStream = completeStream;
const anthropic_1 = require("./adapters/anthropic");
const openaiCompatible_1 = require("./adapters/openaiCompatible");
const SPEC_PADRAO = {
    anthropic: { api: 'anthropic' },
    openai: { api: 'openai-compatible' },
    groq: { api: 'openai-compatible', sdk: 'groq' },
};
function providerSpecDe(params) {
    const spec = params.providerSpec ?? SPEC_PADRAO[params.provider];
    if (!spec) {
        throw new Error(`Provedor "${params.provider}" não é um dos três nativos e veio sem providerSpec — ` +
            'declare-o em src/models/models.json e passe o spec (resolveRole já devolve).');
    }
    if (!spec.api) {
        throw new Error(`Provedor "${params.provider}" está no registro mas este cliente não fala com ele ` +
            '(sem api no spec). Está no catálogo só para ter preço.');
    }
    return spec;
}
async function complete(params) {
    const spec = providerSpecDe(params);
    if (spec.api === 'anthropic')
        return (0, anthropic_1.completeAnthropic)(params);
    return (0, openaiCompatible_1.completeOpenAICompatible)(spec, params);
}
function completeStream(params) {
    const spec = providerSpecDe(params);
    if (spec.api === 'anthropic')
        return (0, anthropic_1.streamAnthropic)(params);
    return (0, openaiCompatible_1.streamOpenAICompatible)(spec, params);
}
//# sourceMappingURL=complete.js.map