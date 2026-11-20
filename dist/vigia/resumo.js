"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSTRUCAO = void 0;
exports.entradaDoResumo = entradaDoResumo;
exports.escreverResumo = escreverResumo;
const cascade_1 = require("../fallback/cascade");
const registry_1 = require("../models/registry");
exports.INSTRUCAO = 'Você escreve o resumo de um relatório técnico semanal para o dono de uma pequena empresa de software, ' +
    'em português do Brasil. Use SÓ os achados recebidos: não invente causa, número nem produto. ' +
    'Em no máximo 6 linhas: o que é mais urgente e por quê (em linguagem de negócio, sem jargão), ' +
    'o que é novo nesta semana e o que pode esperar. Não repita a lista inteira. Sem markdown.';
function entradaDoResumo(achados, cmp) {
    const novos = new Set(cmp.novos.map((a) => a.id));
    const linhas = achados.slice(0, 30).map((a) => `- [${a.gravidade}${novos.has(a.id) ? ', novo' : ''}] ${a.titulo}. Ação: ${a.acao}`);
    return `Achados desta semana (${achados.length}):\n${linhas.join('\n')}\n` +
        `Resolvidos desde a semana passada: ${cmp.resolvidos.length ? cmp.resolvidos.join(', ') : 'nenhum'}.`;
}
async function escreverResumo(achados, cmp, chaves, chamar = cascade_1.completeWithFallback) {
    if (!achados.length)
        return { texto: null, motivo: 'sem achados' };
    let passos;
    try {
        passos = (0, registry_1.passosDoPapel)('classificacao', undefined, chaves);
    }
    catch (e) {
        return { texto: null, motivo: e.message };
    }
    try {
        const r = await chamar({ useCase: 'vigia_resumo', steps: passos }, { system: exports.INSTRUCAO, messages: [{ role: 'user', content: entradaDoResumo(achados, cmp) }],
            maxTokens: 1500, temperature: 0.2, feature: 'vigia_resumo' });
        const texto = r.text.trim();
        return texto ? { texto, modelo: r.modelUsed } : { texto: null, modelo: r.modelUsed, motivo: `${r.modelUsed} respondeu vazio` };
    }
    catch (e) {
        return { texto: null, motivo: `IA indisponível: ${e.message.slice(0, 160)}` };
    }
}
//# sourceMappingURL=resumo.js.map