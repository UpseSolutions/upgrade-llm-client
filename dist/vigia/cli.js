#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const coleta_1 = require("./coleta");
const regras_1 = require("./regras");
const relatorio_1 = require("./relatorio");
const resumo_1 = require("./resumo");
const PASTA = process.env.VIGIA_PASTA || '/var/lib/vigia';
const ALVOS = process.env.VIGIA_ALVOS || '/etc/vigia/alvos.json';
const rodar = (comando, prazoMs = 30_000) => {
    try {
        return (0, node_child_process_1.execSync)(comando, { encoding: 'utf8', timeout: prazoMs, maxBuffer: 64 * 1024 * 1024, shell: '/bin/bash',
            stdio: ['ignore', 'pipe', 'ignore'] });
    }
    catch (e) {
        return e.stdout ?? '';
    }
};
const buscar = async (url) => {
    const t0 = Date.now();
    const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'upgrade-vigia' }, signal: AbortSignal.timeout(20_000) });
    return { status: r.status, segundos: (Date.now() - t0) / 1000 };
};
async function enviarEmail(assuntoTxt, corpo) {
    const { VIGIA_EMAILSELLER_URL: url, VIGIA_EMAILSELLER_KEY: chave, VIGIA_EMAIL_DE: de, VIGIA_EMAIL_PARA: para } = process.env;
    if (!url || !chave || !de || !para)
        return 'e-mail não configurado';
    const falhas = [];
    for (const destino of para.split(',').map((s) => s.trim()).filter(Boolean)) {
        const r = await fetch(`${url}/transactional/send`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': chave },
            body: JSON.stringify({ to: destino, subject: assuntoTxt, html: corpo, from: de, fromName: 'Vigia · Upgrade' }),
            signal: AbortSignal.timeout(30_000),
        }).catch(() => null);
        if (!r || !r.ok)
            falhas.push(`${destino.split('@')[1]}: ${r ? r.status : 'sem resposta'}`);
    }
    return falhas.length ? `falhas: ${falhas.join('; ')}` : 'enviado';
}
async function principal() {
    const agora = new Date();
    const dia = agora.toISOString().slice(0, 10);
    if (!(0, node_fs_1.existsSync)(ALVOS))
        throw new Error(`configuração não encontrada em ${ALVOS} (modelo: alvos.exemplo.json)`);
    const dados = JSON.parse((0, node_fs_1.readFileSync)(ALVOS, 'utf8'));
    const cfg = dados.config;
    (0, node_fs_1.mkdirSync)(PASTA, { recursive: true });
    const fatos = await (0, coleta_1.coletar)(dados.alvos, cfg.regrasDeLog, rodar, buscar, agora);
    const achados = (0, regras_1.avaliar)(fatos, cfg);
    const arqEstado = (0, node_path_1.join)(PASTA, 'estado.json');
    const anteriores = (0, node_fs_1.existsSync)(arqEstado) ? JSON.parse((0, node_fs_1.readFileSync)(arqEstado, 'utf8')).ids ?? [] : [];
    const cmp = (0, regras_1.comparar)(achados, anteriores);
    const resumo = process.argv.includes('--sem-ia')
        ? { texto: null, motivo: 'desligado (--sem-ia)' }
        : await (0, resumo_1.escreverResumo)(achados, cmp, process.env);
    const md = (0, relatorio_1.markdown)(achados, cmp, dia, resumo.texto);
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(PASTA, `relatorio-${dia}.md`), md, 'utf8');
    (0, node_fs_1.writeFileSync)(arqEstado, JSON.stringify({ dia, ids: achados.map((a) => a.id) }, null, 1), 'utf8');
    const envio = process.argv.includes('--sem-email') ? 'não enviado (--sem-email)'
        : await enviarEmail((0, relatorio_1.assunto)(achados, cmp), (0, relatorio_1.html)(achados, cmp, dia, resumo.texto));
    console.log(md);
    console.log(`\n---\nachados: ${achados.length} | novos: ${cmp.novos.length} | resolvidos: ${cmp.resolvidos.length}` +
        ` | resumo: ${resumo.texto ? `ok (${'modelo' in resumo ? resumo.modelo : ''})` : resumo.motivo} | e-mail: ${envio}`);
    if (achados.some((a) => a.gravidade === 'critica'))
        process.exitCode = 2;
}
principal().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map