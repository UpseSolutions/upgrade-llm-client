#!/usr/bin/env node
// Linha de comando do vigia das plataformas. Roda NA VPS, toda segunda às 07:00 (Brasília),
// pelo cron (/etc/cron.d/vigia-plataformas):
//
//   node dist/vigia/cli.js                    coleta, avalia, grava o relatório e manda o e-mail
//   node dist/vigia/cli.js --sem-email        só grava e mostra na tela
//   node dist/vigia/cli.js --sem-ia           sem o resumo escrito por IA
//
// Variáveis (em /etc/vigia.env, permissão 600 — o único lugar onde a CLI lê ambiente; a lib
// continua sem ler env):
//   VIGIA_ALVOS (padrão /etc/vigia/alvos.json: o inventário, que não vai para o repositório)
//   VIGIA_EMAILSELLER_URL, VIGIA_EMAILSELLER_KEY, VIGIA_EMAIL_DE, VIGIA_EMAIL_PARA
//   e as chaves dos provedores do papel `classificacao` (OPENAI_API_KEY, GROQ_API_KEY), opcionais.
//
// Grava em /var/lib/vigia: relatorio-AAAA-MM-DD.md e estado.json (os ids da semana, para a
// comparação seguinte). Sai com código 2 quando há achado crítico (útil para quem chama).

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coletar, type Alvos, type Buscar, type Rodar } from './coleta';
import { avaliar, comparar, type Config } from './regras';
import { assunto, html, markdown } from './relatorio';
import { escreverResumo } from './resumo';

const PASTA = process.env.VIGIA_PASTA || '/var/lib/vigia';
// O inventário real fica SÓ na máquina vigiada: este repositório é público, e uma lista de
// domínios, bancos e caminhos de backup, junto com o que está quebrado, é um mapa para atacante.
const ALVOS = process.env.VIGIA_ALVOS || '/etc/vigia/alvos.json';

const rodar: Rodar = (comando, prazoMs = 30_000) => {
  try {
    return execSync(comando, { encoding: 'utf8', timeout: prazoMs, maxBuffer: 64 * 1024 * 1024, shell: '/bin/bash',
      stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return (e as { stdout?: string }).stdout ?? '';
  }
};

const buscar: Buscar = async (url) => {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'upgrade-vigia' }, signal: AbortSignal.timeout(20_000) });
  return { status: r.status, segundos: (Date.now() - t0) / 1000 };
};

async function enviarEmail(assuntoTxt: string, corpo: string): Promise<string> {
  const { VIGIA_EMAILSELLER_URL: url, VIGIA_EMAILSELLER_KEY: chave, VIGIA_EMAIL_DE: de, VIGIA_EMAIL_PARA: para } = process.env;
  if (!url || !chave || !de || !para) return 'e-mail não configurado';
  const falhas: string[] = [];
  for (const destino of para.split(',').map((s) => s.trim()).filter(Boolean)) {
    const r = await fetch(`${url}/transactional/send`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': chave },
      body: JSON.stringify({ to: destino, subject: assuntoTxt, html: corpo, from: de, fromName: 'Vigia · Upgrade' }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!r || !r.ok) falhas.push(`${destino.split('@')[1]}: ${r ? r.status : 'sem resposta'}`);
  }
  return falhas.length ? `falhas: ${falhas.join('; ')}` : 'enviado';
}

async function principal() {
  const agora = new Date();
  const dia = agora.toISOString().slice(0, 10);
  if (!existsSync(ALVOS)) throw new Error(`configuração não encontrada em ${ALVOS} (modelo: alvos.exemplo.json)`);
  const dados = JSON.parse(readFileSync(ALVOS, 'utf8'));
  const cfg = dados.config as Config;
  mkdirSync(PASTA, { recursive: true });

  const fatos = await coletar(dados.alvos as Alvos, cfg.regrasDeLog, rodar, buscar, agora);
  const achados = avaliar(fatos, cfg);

  const arqEstado = join(PASTA, 'estado.json');
  const anteriores: string[] = existsSync(arqEstado) ? JSON.parse(readFileSync(arqEstado, 'utf8')).ids ?? [] : [];
  const cmp = comparar(achados, anteriores);

  const resumo = process.argv.includes('--sem-ia')
    ? { texto: null, motivo: 'desligado (--sem-ia)' }
    : await escreverResumo(achados, cmp, process.env);

  const md = markdown(achados, cmp, dia, resumo.texto);
  writeFileSync(join(PASTA, `relatorio-${dia}.md`), md, 'utf8');
  writeFileSync(arqEstado, JSON.stringify({ dia, ids: achados.map((a) => a.id) }, null, 1), 'utf8');

  const envio = process.argv.includes('--sem-email') ? 'não enviado (--sem-email)'
    : await enviarEmail(assunto(achados, cmp), html(achados, cmp, dia, resumo.texto));

  console.log(md);
  console.log(`\n---\nachados: ${achados.length} | novos: ${cmp.novos.length} | resolvidos: ${cmp.resolvidos.length}` +
    ` | resumo: ${resumo.texto ? `ok (${'modelo' in resumo ? resumo.modelo : ''})` : resumo.motivo} | e-mail: ${envio}`);
  if (achados.some((a) => a.gravidade === 'critica')) process.exitCode = 2;
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
