"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRetryable = isRetryable;
function isRetryable(err) {
    const e = err;
    const status = e?.status ?? e?.response?.status;
    const msg = String(e?.message ?? e?.error?.error?.message ?? '').toLowerCase();
    if (status === 429 || status === 503)
        return true;
    return (msg.includes('overloaded') ||
        msg.includes('unavailable') ||
        msg.includes('credit balance') ||
        msg.includes('insufficient') ||
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('etimedout') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused'));
}
//# sourceMappingURL=isRetryable.js.map