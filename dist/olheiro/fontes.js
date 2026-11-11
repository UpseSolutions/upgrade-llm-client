"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTORES = void 0;
exports.tamanhoPeloNome = tamanhoPeloNome;
exports.normalizarAberto = normalizarAberto;
exports.buscarAbertos = buscarAbertos;
exports.buscarHospedados = buscarHospedados;
exports.AUTORES = [
    'Qwen', 'google', 'microsoft', 'meta-llama', 'HuggingFaceTB', 'mistralai', 'deepseek-ai',
    'ibm-granite', 'LiquidAI', 'nvidia', 'openbmb', 'tiiuae', 'apple', 'allenai', 'CohereLabs',
];
const TIPOS = new Set(['text-generation', 'image-text-to-text', 'any-to-any']);
const DERIVADO = /gguf|fp8|fp4|bf16|gptq|awq|int4|int8|\dbit|onnx|mlx|\bqat\b|-qat-|bnb|unquantized|sae-|-base$/i;
const ESPECIALISTA = /ocr|vision|-vl\b|-v-|audio|omni|embed|guard|rerank|coder|-assistant$/i;
function tamanhoPeloNome(id) {
    const nome = id.split('/').pop() ?? id;
    const m = nome.match(/(?<![A-Za-z\d.])(\d+(?:\.\d+)?)\s*([bm])(?![a-z\d])/i);
    if (!m)
        return null;
    const n = Number(m[1]);
    return m[2].toLowerCase() === 'b' ? n : n / 1000;
}
function tamanho(m) {
    const total = m.safetensors?.total;
    const pelaApi = total && total > 5e7 ? Math.round((total / 1e9) * 100) / 100 : null;
    const peloNome = tamanhoPeloNome(m.id);
    if (pelaApi && peloNome && Math.max(pelaApi, peloNome) / Math.min(pelaApi, peloNome) > 3) {
        return Math.max(pelaApi, peloNome);
    }
    return pelaApi ?? peloNome;
}
function derivadoDeOutro(m) {
    const bases = [m.cardData?.base_model ?? []].flat();
    if (bases.length === 0)
        return false;
    return !bases.some((b) => b.startsWith(m.id) || m.id.startsWith(b));
}
function normalizarAberto(m, origem) {
    if (!m.id || !m.createdAt)
        return null;
    if (!m.pipeline_tag || !TIPOS.has(m.pipeline_tag))
        return null;
    if (DERIVADO.test(m.id) || ESPECIALISTA.test(m.id) || derivadoDeOutro(m))
        return null;
    return {
        id: m.id,
        autor: m.id.split('/')[0],
        criadoEm: m.createdAt.slice(0, 10),
        parametrosB: tamanho(m),
        licenca: m.cardData?.license ?? null,
        tipo: m.pipeline_tag,
        downloads: m.downloads ?? 0,
        origem,
    };
}
const CAMPOS = ['safetensors', 'createdAt', 'cardData', 'downloads', 'pipeline_tag']
    .map((c) => `expand[]=${c}`)
    .join('&');
function motivoDe(e) {
    if (!(e instanceof Error))
        return String(e);
    const causa = e.cause;
    return causa ? `${e.message} (${causa.code ?? causa.message})` : e.message;
}
async function lerLista(buscar, url) {
    const r = await buscar(url);
    if (!r.ok)
        throw new Error(`HTTP ${r.status}`);
    const corpo = await r.json();
    if (!Array.isArray(corpo))
        throw new Error('resposta não é uma lista');
    return corpo;
}
async function buscarAbertos(buscar, autores = exports.AUTORES) {
    const falhas = [];
    const vistos = new Map();
    const base = 'https://huggingface.co/api/models';
    const consultas = [
        ...autores.map((a) => [
            `huggingface:${a}`,
            `${base}?author=${a}&sort=createdAt&direction=-1&limit=100&${CAMPOS}`,
            'autor',
        ]),
        ['huggingface:tendencia', `${base}?pipeline_tag=text-generation&sort=trendingScore&direction=-1&limit=100&${CAMPOS}`, 'tendencia'],
    ];
    for (const [fonte, url, origem] of consultas) {
        try {
            for (const cru of await lerLista(buscar, url)) {
                const m = normalizarAberto(cru, origem);
                if (m && !vistos.has(m.id))
                    vistos.set(m.id, m);
            }
        }
        catch (e) {
            falhas.push({ fonte, motivo: motivoDe(e) });
        }
    }
    return { modelos: [...vistos.values()], falhas };
}
async function buscarHospedados(buscar) {
    try {
        const r = await buscar('https://openrouter.ai/api/v1/models');
        if (!r.ok)
            throw new Error(`HTTP ${r.status}`);
        const corpo = (await r.json());
        if (!Array.isArray(corpo.data))
            throw new Error('resposta sem `data`');
        const modelos = corpo.data
            .filter((m) => m.id && m.created && !m.id.endsWith(':batch') && Number(m.pricing?.prompt ?? 0) >= 0)
            .map((m) => {
            const entrada = Number(m.pricing?.prompt ?? 0) * 1e6;
            const saida = Number(m.pricing?.completion ?? 0) * 1e6;
            return {
                id: m.id,
                nome: m.name ?? m.id,
                criadoEm: new Date(m.created * 1000).toISOString().slice(0, 10),
                entradaPorMTok: Math.round(entrada * 1000) / 1000,
                saidaPorMTok: Math.round(saida * 1000) / 1000,
                ferramentas: (m.supported_parameters ?? []).includes('tools'),
                gratis: entrada === 0 && saida === 0,
            };
        });
        return { modelos, falhas: [] };
    }
    catch (e) {
        return { modelos: [], falhas: [{ fonte: 'openrouter', motivo: motivoDe(e) }] };
    }
}
//# sourceMappingURL=fontes.js.map