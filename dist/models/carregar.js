"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registroAtual = registroAtual;
exports.fonteDoRegistro = fonteDoRegistro;
exports.redefinirRegistro = redefinirRegistro;
exports.carregarRegistro = carregarRegistro;
const models_json_1 = __importDefault(require("./models.json"));
const TIMEOUT_PADRAO_MS = 3000;
let atual = models_json_1.default;
let fonte = 'compilado';
function registroAtual() {
    return atual;
}
function fonteDoRegistro() {
    return fonte;
}
function redefinirRegistro() {
    atual = models_json_1.default;
    fonte = 'compilado';
}
async function carregarRegistro(opcoes) {
    const resultado = await buscar(opcoes);
    opcoes.aoTerminar?.(resultado);
    return resultado;
}
async function buscar(opcoes) {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS);
    try {
        const resposta = await fetch(new URL('/registry', opcoes.collectorUrl).toString(), {
            headers: { 'x-api-key': opcoes.apiKey },
            signal: controle.signal,
        });
        if (!resposta.ok) {
            return cair(`coletor respondeu ${resposta.status}`);
        }
        const corpo = (await resposta.json());
        const problema = porQueNaoServe(corpo?.content);
        if (problema) {
            return cair(`registro recebido não serve: ${problema}`);
        }
        atual = corpo.content;
        fonte = 'coletor';
        return { fonte: 'coletor', version: atual.version };
    }
    catch (err) {
        const motivo = controle.signal.aborted
            ? `coletor não respondeu em ${opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS}ms`
            : `falha ao buscar: ${err?.message ?? 'desconhecida'}`;
        return cair(motivo);
    }
    finally {
        clearTimeout(prazo);
    }
}
function cair(motivo) {
    redefinirRegistro();
    return { fonte: 'compilado', version: atual.version, motivo };
}
function porQueNaoServe(bruto) {
    if (!bruto || typeof bruto !== 'object')
        return 'não é objeto';
    const r = bruto;
    if (typeof r.version !== 'number')
        return 'sem version';
    for (const campo of ['providers', 'models', 'roles']) {
        if (!r[campo] || typeof r[campo] !== 'object')
            return `sem ${campo}`;
    }
    if (Object.keys(r.roles).length === 0)
        return 'nenhum papel';
    for (const [papel, def] of Object.entries(r.roles)) {
        const cascata = def?.cascade;
        if (!Array.isArray(cascata) || cascata.length === 0)
            return `papel "${papel}" sem cascata`;
        for (const id of cascata) {
            const modelo = r.models[id];
            if (!modelo)
                return `papel "${papel}" aponta para o modelo inexistente "${id}"`;
            if (!r.providers[modelo.provider]) {
                return `modelo "${id}" aponta para o provedor inexistente "${modelo.provider}"`;
            }
        }
    }
    for (const papel of Object.keys(models_json_1.default.roles)) {
        if (!r.roles[papel])
            return `o papel "${papel}" sumiu do registro recebido`;
    }
    return null;
}
//# sourceMappingURL=carregar.js.map