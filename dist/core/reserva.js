"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchComReservaAnthropic = exports.FEATURE_SDK_DIRETO = exports.LIMITE_POR_HORA_PADRAO = exports.PAUSA_SEM_CREDITO_MS = void 0;
exports.configurarReservaAnthropic = configurarReservaAnthropic;
exports.semCredito = semCredito;
exports.comReserva = comReserva;
exports.PAUSA_SEM_CREDITO_MS = 15 * 60_000;
exports.LIMITE_POR_HORA_PADRAO = 60;
let config = null;
let principalSemCreditoAte = 0;
let reservaSemCreditoAte = 0;
const chamadas = new Map();
function configurarReservaAnthropic(novo) {
    config = novo?.principal && novo.reserva ? novo : null;
    principalSemCreditoAte = 0;
    reservaSemCreditoAte = 0;
    chamadas.clear();
}
function semCredito(err) {
    const e = err;
    const msg = `${e?.message ?? ''} ${e?.error?.error?.message ?? ''}`.toLowerCase();
    return msg.includes('credit balance');
}
class RecusaLocal extends Error {
}
function avisar(mensagem) {
    (config?.aviso ?? console.error)(`[llm-client] ${mensagem}`);
}
function naReserva(params) {
    const agora = Date.now();
    const lista = (chamadas.get(params.feature) ?? []).filter((t) => agora - t < 3600_000);
    const limite = config.limitePorHora?.[params.feature] ?? exports.LIMITE_POR_HORA_PADRAO;
    chamadas.set(params.feature, lista);
    if (lista.length >= limite) {
        if (lista.length === limite) {
            lista.push(agora);
            avisar(`${params.feature} passou de ${limite} chamadas por hora na reserva da Anthropic. Chamada em laço?`);
        }
        throw new RecusaLocal(`limite de ${limite} chamadas de IA por hora na reserva (${params.feature})`);
    }
    lista.push(agora);
    return { ...params, apiKey: config.reserva };
}
function escolher(params) {
    if (!config || params.provider !== 'anthropic' || params.apiKey !== config.principal)
        return params;
    if (Date.now() >= principalSemCreditoAte)
        return params;
    if (Date.now() < reservaSemCreditoAte)
        throw new RecusaLocal('Anthropic sem crédito (credit balance) nas duas contas, pausado');
    return naReserva(params);
}
function depoisDaRecusa(usados, err) {
    if (!config || usados.provider !== 'anthropic' || !semCredito(err))
        return null;
    const minutos = exports.PAUSA_SEM_CREDITO_MS / 60_000;
    if (usados.apiKey === config.reserva) {
        reservaSemCreditoAte = Date.now() + exports.PAUSA_SEM_CREDITO_MS;
        avisar(`Reserva da Anthropic também SEM CRÉDITO (${usados.feature}): pausada por ${minutos} min.`);
        return null;
    }
    if (usados.apiKey !== config.principal)
        return null;
    principalSemCreditoAte = Date.now() + exports.PAUSA_SEM_CREDITO_MS;
    if (Date.now() < reservaSemCreditoAte)
        return null;
    avisar(`Chave principal da Anthropic SEM CRÉDITO (${usados.feature}): usando a reserva por ${minutos} min.`);
    return naReserva(usados);
}
async function comReserva(params, chamar) {
    const usados = escolher(params);
    try {
        return await chamar(usados);
    }
    catch (err) {
        const outra = depoisDaRecusa(usados, err);
        if (!outra)
            throw err;
        try {
            return await chamar(outra);
        }
        catch (errNaReserva) {
            depoisDaRecusa(outra, errNaReserva);
            throw errNaReserva;
        }
    }
}
class RecusaPorSaldo extends Error {
    constructor(resposta, corpo) {
        super(corpo);
        this.resposta = resposta;
    }
}
exports.FEATURE_SDK_DIRETO = 'sdk_direto';
const fetchComReservaAnthropic = async (url, init) => {
    const cabecalhos = new Headers(init?.headers);
    const base = {
        provider: 'anthropic', apiKey: cabecalhos.get('x-api-key') ?? '', model: '', messages: [], maxTokens: 0, feature: exports.FEATURE_SDK_DIRETO,
    };
    try {
        return await comReserva(base, async (p) => {
            cabecalhos.set('x-api-key', p.apiKey);
            const resposta = await fetch(url, { ...init, headers: cabecalhos });
            if (resposta.status !== 400)
                return resposta;
            const corpo = await resposta.clone().text();
            if (semCredito(new Error(corpo)))
                throw new RecusaPorSaldo(resposta, corpo);
            return resposta;
        });
    }
    catch (err) {
        if (err instanceof RecusaPorSaldo)
            return err.resposta;
        if (!(err instanceof RecusaLocal))
            throw err;
        return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: err.message } }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
};
exports.fetchComReservaAnthropic = fetchComReservaAnthropic;
//# sourceMappingURL=reserva.js.map