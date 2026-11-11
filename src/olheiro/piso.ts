// O PISO de um papel: o menor modelo que cumpre a tarefa, e a prova de que o de baixo não cumpre.
//
// Duas perguntas do dono (11/11/2026), respondidas com regra escrita em vez de impressão:
//
// 1. "Este modelo está no limite?"  -> veredito do degrau: aprovado | em_aberto | no_limite
// 2. "Já achamos o menor possível?" -> piso do papel:       provado | provisorio | sem_piso
//
// O caso que deu origem à regra: o Qwen3 1,7B no atendimento com agenda. Duas rodadas de treino,
// a validação melhorou (0,446 -> 0,423) e a pior prova caiu (85% -> 78%): cada rodada consertava
// um erro e abria outro. Sem regra, a tentação é "só mais uma rodada" para sempre. Com regra, a
// segunda rodada sem ganho na PIOR prova encerra o degrau, e o tempo vai para outra coisa.
//
// Tudo aqui é puro: recebe os dados de escadas.json e devolve o veredito. Sem rede, sem relógio.

export interface Rodada {
  versao: string;
  em: string;
  /** pass@1 de 0 a 1, por prova. */
  notas: Record<string, number>;
  modelo?: string;
  obs?: string;
}

export interface Degrau {
  /** Id do modelo-base no Hugging Face, ex.: "Qwen/Qwen3-1.7B". */
  base: string;
  parametrosB: number;
  rodadas: Rodada[];
}

export interface Escada {
  descricao?: string;
  degraus: Degrau[];
}

export interface Criterio {
  notaMinima: number;
  rodadasParaLimite: number;
  ganhoMinimoPp: number;
  mudancaQueContaPp: number;
}

export type Veredito = 'aprovado' | 'em_aberto' | 'no_limite';

export interface VereditoDoDegrau {
  base: string;
  parametrosB: number;
  veredito: Veredito;
  /** A menor nota entre as provas, na rodada que decidiu. */
  piorNota: number | null;
  rodadas: number;
  motivo: string;
}

export interface PisoDoPapel {
  /** provado: o degrau de baixo foi testado até o limite. provisorio: ainda dá para descer. */
  estado: 'provado' | 'provisorio' | 'sem_piso';
  piso: VereditoDoDegrau | null;
  degraus: VereditoDoDegrau[];
  motivo: string;
}

const pp = (x: number) => Math.round(x * 100);

function pior(r: Rodada): number {
  const notas = Object.values(r.notas);
  return notas.length ? Math.min(...notas) : 0;
}

/** O que mudou entre duas rodadas, prova a prova, acima do ruído. */
function mudancas(antes: Rodada, depois: Rodada, minimoPp: number) {
  const melhorou: string[] = [];
  const piorou: string[] = [];
  for (const [prova, nota] of Object.entries(depois.notas)) {
    const anterior = antes.notas[prova];
    if (anterior === undefined) continue;
    const delta = pp(nota) - pp(anterior);
    if (delta >= minimoPp) melhorou.push(`${prova} +${delta}`);
    if (delta <= -minimoPp) piorou.push(`${prova} ${delta}`);
  }
  return { melhorou, piorou };
}

export function vereditoDoDegrau(degrau: Degrau, c: Criterio): VereditoDoDegrau {
  const base = { base: degrau.base, parametrosB: degrau.parametrosB, rodadas: degrau.rodadas.length };

  if (degrau.rodadas.length === 0) {
    return { ...base, veredito: 'em_aberto', piorNota: null, motivo: 'nenhuma rodada medida' };
  }

  // Passa quem chega na barra na PIOR prova. Média esconde o caso que quebra: 98% de média com
  // uma prova em 78% é um agente que marca visita errada para um tipo inteiro de negócio.
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

  // O ganho é medido contra a MELHOR rodada anterior, não contra a penúltima: senão uma rodada
  // ruim seguida de uma que volta ao que já era contaria como progresso.
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
  const deslocou =
    melhorou.length && piorou.length
      ? ` Os erros mudaram de lugar: melhorou ${melhorou.join(', ')}; piorou ${piorou.join(', ')}.`
      : piorou.length
        ? ` Piorou ${piorou.join(', ')}.`
        : '';
  return {
    ...base,
    veredito: 'no_limite',
    piorNota: pior(ultima),
    motivo:
      `${degrau.rodadas.length} rodadas abaixo da barra e a pior prova não subiu ` +
      `(${pp(melhorAntes)}% -> ${pp(pior(ultima))}%).${deslocou}`,
  };
}

export function pisoDoPapel(escada: Escada, c: Criterio): PisoDoPapel {
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

  // "Provado" vale para os modelos-base que existiam quando a escada foi medida. Um modelo novo
  // e menor reabre a pergunta, e é o olheiro quem avisa (olheiro.ts, `reabrePiso`).
  return {
    estado: 'provado',
    piso,
    degraus,
    motivo: `${piso.base} passa e ${abaixo.map((d) => d.base).join(', ')} chegou ao limite`,
  };
}
