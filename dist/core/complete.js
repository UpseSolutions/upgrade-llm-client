"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.complete = complete;
exports.completeStream = completeStream;
const anthropic_1 = require("./adapters/anthropic");
const openaiCompatible_1 = require("./adapters/openaiCompatible");
async function complete(params) {
    if (params.provider === 'anthropic')
        return (0, anthropic_1.completeAnthropic)(params);
    return (0, openaiCompatible_1.completeOpenAICompatible)(params.provider, params);
}
function completeStream(params) {
    if (params.provider === 'anthropic')
        return (0, anthropic_1.streamAnthropic)(params);
    return (0, openaiCompatible_1.streamOpenAICompatible)(params.provider, params);
}
//# sourceMappingURL=complete.js.map