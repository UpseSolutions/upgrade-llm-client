"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vereditoDoDegrau = vereditoDoDegrau;
exports.pisoDoPapel = pisoDoPapel;
const pp = (x) => Math.round(x * 100);
function pior(r) {
    const notas = Object.values(r.notas);
    return notas.length ? Math.min(...notas) : 0;
}
function mudancas(antes, depois, minimoPp) {
    const melhorou = [];
    const piorou = [];
    for (const [prova, nota] of Object.entries(depois.notas)) {
        const anterior = antes.notas[prova];
        if (anterior === undefined)
            continue;
        const delta = pp(nota) - pp(anterior);
        if (delta >= minimoPp)
            melhorou.push(`${prova} +${delta}`);
        if (delta <= -minimoPp)
            piorou.push(`${prova} ${delta}`);
    }
    return { melhorou, piorou };
}
function vereditoDoDegrau(degrau, c) {
    const base = { base: degrau.base, parametrosB: degrau.parametrosB, rodadas: degrau.rodadas.length };
    if (degrau.rodadas.length === 0) {
        return { ...base, veredito: 'em_aberto', piorNota: null, motivo: 'nenhuma rodada medida' };
    }
    const aprovada = degrau.rodadas.find((r) => pior(r) >= c.notaMinima);
    if (aprovada) {
        return {
            ...base,
            veredito: 'aprovado',
            piorNota: pior(aprovada),
            motivo: `${aprovada.versao}: pior prova em ${pp(pior(aprovada))}% (barra ${pp(c.notaMinima)}%)`,
        };
    }
    const ultima = degrau.rodadas[degrau.rodadas.length - 1];
    if (degrau.rodadas.length < c.rodadasParaLimite) {
        return {
            ...base,
            veredito: 'em_aberto',
            piorNota: pior(ultima),
            motivo: `${ultima.versao}: pior prova em ${pp(pior(ultima))}%; uma rodada só não prova o limite`,
        };
    }
    const anteriores = degrau.rodadas.slice(0, -1);
    const melhorAntes = Math.max(...anteriores.map(pior));
    const ganho = pp(pior(ultima)) - pp(melhorAntes);
    if (ganho >= c.ganhoMinimoPp) {
        return {
            ...base,
            veredito: 'em_aberto',
            piorNota: pior(ultima),
            motivo: `${ultima.versao}: pior prova subiu ${ganho} pontos (${pp(pior(ultima))}%); ainda melhorando`,
        };
    }
    const { melhorou, piorou } = mudancas(anteriores[anteriores.length - 1], ultima, c.mudancaQueContaPp);
    const deslocou = melhorou.length && piorou.length
        ? ` Os erros mudaram de lugar: melhorou ${melhorou.join(', ')}; piorou ${piorou.join(', ')}.`
        : piorou.length
            ? ` Piorou ${piorou.join(', ')}.`
            : '';
    return {
        ...base,
        veredito: 'no_limite',
        piorNota: pior(ultima),
        motivo: `${degrau.rodadas.length} rodadas abaixo da barra e a pior prova não subiu ` +
            `(${pp(melhorAntes)}% -> ${pp(pior(ultima))}%).${deslocou}`,
    };
}
function pisoDoPapel(escada, c) {
    const degraus = [...escada.degraus]
        .sort((a, b) => a.parametrosB - b.parametrosB)
        .map((d) => vereditoDoDegrau(d, c));
    const piso = degraus.find((d) => d.veredito === 'aprovado') ?? null;
    if (!piso) {
        return { estado: 'sem_piso', piso: null, degraus, motivo: 'nenhum degrau passou na barra ainda' };
    }
    const abaixo = degraus.filter((d) => d.parametrosB < piso.parametrosB);
    if (abaixo.length === 0) {
        return {
            estado: 'provisorio',
            piso,
            degraus,
            motivo: `${piso.base} passa, e nenhum degrau menor foi testado: ainda dá para descer`,
        };
    }
    const aberto = abaixo.find((d) => d.veredito !== 'no_limite');
    if (aberto) {
        return {
            estado: 'provisorio',
            piso,
            degraus,
            motivo: `${piso.base} passa; ${aberto.base} ainda está em aberto`,
        };
    }
    return {
        estado: 'provado',
        piso,
        degraus,
        motivo: `${piso.base} passa e ${abaixo.map((d) => d.base).join(', ')} chegou ao limite`,
    };
}
//# sourceMappingURL=piso.js.map