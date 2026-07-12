// Generalização de isServiceUnavailable() do AlfabetIA (kitWorker.ts) — a
// cascata de fallback mais madura em produção do portfólio. Erro de
// validação/auth (4xx que não seja 429) falha rápido, sem cascata: só
// indisponibilidade genuína do provedor justifica tentar o próximo.
export function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; response?: { status?: number }; message?: string; error?: { error?: { message?: string } } };
  const status = e?.status ?? e?.response?.status;
  const msg = String(e?.message ?? e?.error?.error?.message ?? '').toLowerCase();

  if (status === 429 || status === 503) return true;

  return (
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('credit balance') ||
    msg.includes('insufficient') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused')
  );
}
