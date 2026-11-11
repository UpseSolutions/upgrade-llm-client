#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const escadas_json_1 = __importDefault(require("./escadas.json"));
const fontes_1 = require("./fontes");
const olheiro_1 = require("./olheiro");
const registry_1 = require("../models/registry");
function argumento(nome) {
    const i = process.argv.indexOf(`--${nome}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
async function principal() {
    const soPiso = process.argv.includes('--piso');
    const dias = Number(argumento('dias') ?? olheiro_1.OPCOES_PADRAO.dias);
    const saida = argumento('saida');
    const hoje = new Date().toISOString().slice(0, 10);
    const buscar = async (url) => {
        const pedir = () => fetch(url, { headers: { 'user-agent': 'upgrade-llm-client-olheiro' }, signal: AbortSignal.timeout(20_000) });
        try {
            const r = await pedir();
            if (r.status < 500 && r.status !== 429)
                return r;
        }
        catch {
        }
        await new Promise((ok) => setTimeout(ok, 3000));
        return pedir();
    };
    const abertos = soPiso ? { modelos: [], falhas: [] } : await (0, fontes_1.buscarAbertos)(buscar);
    const hospedados = soPiso ? { modelos: [], falhas: [] } : await (0, fontes_1.buscarHospedados)(buscar);
    const precos = (0, registry_1.modelCatalog)()
        .filter((m) => m.price && !m.measuredEngine)
        .map((m) => ({ modelo: m.model, saidaPorMTok: m.price.outputPerMTok }));
    const triagem = (0, olheiro_1.triar)(abertos.modelos, hospedados.modelos, escadas_json_1.default.escadas, escadas_json_1.default.criterio, precos, [...abertos.falhas, ...hospedados.falhas], { ...olheiro_1.OPCOES_PADRAO, hoje, dias });
    const texto = (0, olheiro_1.relatorio)(triagem);
    if (saida) {
        (0, node_fs_1.writeFileSync)(saida, texto, 'utf8');
        console.log(`achados: ${triagem.achados} | falhas: ${triagem.falhas.length} | relatório em ${saida}`);
    }
    else {
        console.log(texto);
    }
}
principal().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map