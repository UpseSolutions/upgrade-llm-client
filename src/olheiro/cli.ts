#!/usr/bin/env node
// Linha de comando do olheiro. É a única parte com rede, relógio e disco.
//
//   node dist/olheiro/cli.js                    relatório dos últimos 8 dias, na tela
//   node dist/olheiro/cli.js --dias 300         primeira varredura (olha para trás)
//   node dist/olheiro/cli.js --saida r.md       grava o relatório num arquivo
//   node dist/olheiro/cli.js --piso             só o piso de cada papel, sem ir à rede
//
// Roda toda segunda pelo GitHub Actions (.github/workflows/olheiro.yml), que abre uma issue
// quando há achado. Não usa chave nenhuma: as duas fontes são públicas.

import { writeFileSync } from 'node:fs';
import dados from './escadas.json';
import { buscarAbertos, buscarHospedados, type Buscar } from './fontes';
import { OPCOES_PADRAO, relatorio, triar } from './olheiro';
import type { Criterio, Escada } from './piso';
import { modelCatalog } from '../models/registry';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function principal() {
  const soPiso = process.argv.includes('--piso');
  const dias = Number(argumento('dias') ?? OPCOES_PADRAO.dias);
  const saida = argumento('saida');
  const hoje = new Date().toISOString().slice(0, 10);

  // Uma segunda tentativa: "fetch failed" passageiro é comum, e sem ela uma família inteira
  // some do relatório daquela semana (aconteceu com a Qwen na primeira varredura).
  const buscar: Buscar = async (url) => {
    const pedir = () => fetch(url, { headers: { 'user-agent': 'upgrade-llm-client-olheiro' }, signal: AbortSignal.timeout(20_000) });
    try {
      const r = await pedir();
      if (r.status < 500 && r.status !== 429) return r;
    } catch {
      // cai na segunda tentativa
    }
    await new Promise((ok) => setTimeout(ok, 3000));
    return pedir();
  };
  const abertos = soPiso ? { modelos: [], falhas: [] } : await buscarAbertos(buscar);
  const hospedados = soPiso ? { modelos: [], falhas: [] } : await buscarHospedados(buscar);

  const precos = modelCatalog()
    .filter((m) => m.price && !m.measuredEngine)
    .map((m) => ({ modelo: m.model, saidaPorMTok: m.price!.outputPerMTok }));

  const triagem = triar(
    abertos.modelos,
    hospedados.modelos,
    dados.escadas as unknown as Record<string, Escada>,
    dados.criterio as unknown as Criterio,
    precos,
    [...abertos.falhas, ...hospedados.falhas],
    { ...OPCOES_PADRAO, hoje, dias },
  );

  const texto = relatorio(triagem);
  if (saida) {
    writeFileSync(saida, texto, 'utf8');
    console.log(`achados: ${triagem.achados} | falhas: ${triagem.falhas.length} | relatório em ${saida}`);
  } else {
    console.log(texto);
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
