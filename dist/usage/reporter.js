"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportUsage = reportUsage;
exports.usageFromTokenUsage = usageFromTokenUsage;
function reportUsage(config, event) {
    if (!config?.collectorApiKey)
        return;
    fetch(`${config.collectorUrl}/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.collectorApiKey },
        body: JSON.stringify(event),
    }).catch(() => {
    });
}
function usageFromTokenUsage(usage) {
    return {
        tokensIn: usage.inputTokens,
        tokensOut: usage.outputTokens,
        tokensCached: usage.cachedTokens,
        ...(usage.cacheWrite5mTokens ? { tokensCacheWrite5m: usage.cacheWrite5mTokens } : {}),
        ...(usage.cacheWrite1hTokens ? { tokensCacheWrite1h: usage.cacheWrite1hTokens } : {}),
    };
}
//# sourceMappingURL=reporter.js.map