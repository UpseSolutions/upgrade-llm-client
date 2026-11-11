"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPCOES_PADRAO = void 0;
exports.classificarLicenca = classificarLicenca;
exports.triar = triar;
exports.relatorio = relatorio;
const piso_1 = require("./piso");
exports.OPCOES_PADRAO = { dias: 8, tetoB: 9, maximoPorLista: 8 };
const LIVRES = new Set(['apache-2.0', 'mit', 'bsd-3-clause', 'cc-by-4.0']);
function classificarLicenca(licenca) {
    if (!licenca)
        return 'conferir';
    const l = licenca.toLowerCase();
    if (LIVRES.has(l))
        return 'livre';
    if (l.includes('-nc') || l.includes('research') || l.includes('non-commercial'))
        return 'sem_uso_comercial';
    return 'conferir';
}
function diasEntre(de, ate) {
    return Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);
}
const recente = (criadoEm, o) => {
    const d = diasEntre(criadoEm, o.hoje);
    return d >= 0 && d <= o.dias;
};
const porDownloads = (a, b) => b.downloads - a.downloads;
function triar(abertos, hospedados, escadas, criterio, precos, falhas, opcoes) {
    const novos = abertos
        .filter((m) => recente(m.criadoEm, opcoes))
        .filter((m) => m.parametrosB !== null && m.parametrosB <= opcoes.tetoB)
        .filter((m) => m.origem === 'autor' || m.downloads >= 5000)
        .map((m) => ({ ...m, licencaUso: classificarLicenca(m.licenca) }))
        .sort(porDownloads);
    const usados = new Set();
    const papeis = Object.entries(escadas).map(([papel, escada]) => {
        const piso = (0, piso_1.pisoDoPapel)(escada, criterio);
        const testados = new Set(escada.degraus.map((d) => d.base.toLowerCase()));
        const inedito = novos.filter((m) => !testados.has(m.id.toLowerCase()));
        const tamanhoDoPiso = piso.piso?.parametrosB ?? Infinity;
        const reabrePiso = inedito.filter((m) => m.parametrosB <= tamanhoDoPiso * 0.75);
        const mesmaFaixa = inedito.filter((m) => m.parametrosB > tamanhoDoPiso * 0.75 && m.parametrosB <= tamanhoDoPiso * 1.25);
        for (const m of [...reabrePiso, ...mesmaFaixa])
            usados.add(m.id);
        return {
            papel,
            piso,
            reabrePiso: reabrePiso.slice(0, opcoes.maximoPorLista),
            mesmaFaixa: mesmaFaixa.slice(0, opcoes.maximoPorLista),
        };
    });
    const comPreco = precos.filter((p) => p.saidaPorMTok > 0).sort((a, b) => a.saidaPorMTok - b.saidaPorMTok);
    const referenciaHospedado = comPreco[0] ?? null;
    const hospedadosNovos = hospedados
        .filter((m) => recente(m.criadoEm, opcoes) && m.ferramentas)
        .filter((m) => !referenciaHospedado || m.saidaPorMTok < referenciaHospedado.saidaPorMTok)
        .sort((a, b) => Number(a.gratis) - Number(b.gratis) || a.saidaPorMTok - b.saidaPorMTok)
        .slice(0, opcoes.maximoPorLista);
    return {
        hoje: opcoes.hoje,
        dias: opcoes.dias,
        papeis,
        pequenosNovos: novos.filter((m) => !usados.has(m.id)).slice(0, opcoes.maximoPorLista),
        hospedadosNovos,
        referenciaHospedado,
        falhas,
        achados: papeis.reduce((n, p) => n + p.reabrePiso.length + p.mesmaFaixa.length, 0),
    };
}
const ROTULO_LICENCA = {
    livre: 'livre',
    conferir: 'conferir antes de usar',
    sem_uso_comercial: 'sem uso comercial (pode medir, não pode ganhar)',
};
const ROTULO_VEREDITO = { aprovado: 'aprovado', em_aberto: 'em aberto', no_limite: 'no limite' };
const ROTULO_ESTADO = { provado: 'provado', provisorio: 'provisório', sem_piso: 'sem piso' };
const tamanhoBr = (b) => b === null ? '?' : b < 1 ? `${Math.round(b * 1000)} M` : `${String(b).replace('.', ',')} B`;
function linhasDeCandidatos(lista) {
    return [
        '| Modelo | Tamanho | Publicado | Licença | Downloads |',
        '|---|---|---|---|---|',
        ...lista.map((m) => `| [${m.id}](https://huggingface.co/${m.id}) | ${tamanhoBr(m.parametrosB)} | ${m.criadoEm} | ` +
            `${ROTULO_LICENCA[m.licencaUso]}${m.licenca ? ` (${m.licenca})` : ''} | ${m.downloads.toLocaleString('pt-BR')} |`),
    ];
}
function relatorio(t) {
    const s = [];
    s.push(`# Olheiro de modelos: ${t.hoje}`, '');
    s.push(`Modelos publicados nos últimos ${t.dias} dias, cruzados com o que já medimos.`, '');
    s.push(`<!-- achados: ${t.achados} -->`, '');
    if (t.falhas.length) {
        s.push('## Fontes que falharam', '');
        s.push('A lista abaixo está incompleta. Vazio aqui não quer dizer que nada saiu.', '');
        for (const f of t.falhas)
            s.push(`- ${f.fonte}: ${f.motivo}`);
        s.push('');
    }
    for (const p of t.papeis) {
        s.push(`## Papel \`${p.papel}\``, '');
        const piso = p.piso.piso;
        s.push(piso
            ? `**Piso ${ROTULO_ESTADO[p.piso.estado]}: ${piso.base} (${tamanhoBr(piso.parametrosB)}).** ${p.piso.motivo}.`
            : `**Sem piso.** ${p.piso.motivo}.`, '');
        s.push('| Degrau | Tamanho | Rodadas | Pior prova | Veredito | Por quê |', '|---|---|---|---|---|---|');
        for (const d of p.piso.degraus) {
            const nota = d.piorNota === null ? '-' : `${Math.round(d.piorNota * 100)}%`;
            s.push(`| ${d.base} | ${tamanhoBr(d.parametrosB)} | ${d.rodadas} | ${nota} | ${ROTULO_VEREDITO[d.veredito]} | ${d.motivo} |`);
        }
        s.push('');
        if (p.reabrePiso.length) {
            s.push('### Reabrem o piso (menores que o piso e nunca testados neste papel)', '');
            s.push(...linhasDeCandidatos(p.reabrePiso), '');
        }
        if (p.mesmaFaixa.length) {
            s.push('### Mesma faixa do piso (não barateiam, mas podem subir a nota)', '');
            s.push(...linhasDeCandidatos(p.mesmaFaixa), '');
        }
        if (!p.reabrePiso.length && !p.mesmaFaixa.length) {
            s.push('Nenhum modelo novo disputa este piso nesta janela.', '');
        }
    }
    if (t.pequenosNovos.length) {
        s.push('## Outros modelos pequenos novos', '', ...linhasDeCandidatos(t.pequenosNovos), '');
    }
    if (t.hospedadosNovos.length) {
        const ref = t.referenciaHospedado;
        s.push('## Hospedados novos, com ferramentas e mais baratos que o nosso mais barato', '');
        if (ref)
            s.push(`Régua: \`${ref.modelo}\`, US$ ${ref.saidaPorMTok} por milhão de tokens de saída.`, '');
        s.push('| Modelo | Publicado | Entrada (US$/M) | Saída (US$/M) |', '|---|---|---|---|');
        for (const m of t.hospedadosNovos) {
            s.push(`| ${m.id} | ${m.criadoEm} | ${m.entradaPorMTok} | ${m.gratis ? '0 (grátis, costuma ter limite e sair do ar)' : m.saidaPorMTok} |`);
        }
        s.push('');
    }
    s.push('## O que fazer com um achado', '');
    s.push('1. Conferir a licença na página do modelo.', '2. Medir **só com prompt** nas provas congeladas do papel (sem treino). Se ficar longe, descartar e anotar.', '3. Se chegar perto, uma rodada de ajuste fino com os dados que já existem.', '4. Registrar a rodada em `src/olheiro/escadas.json`, **passando ou não**. O resultado negativo é o que prova o piso.', '');
    return s.join('\n');
}
//# sourceMappingURL=olheiro.js.map