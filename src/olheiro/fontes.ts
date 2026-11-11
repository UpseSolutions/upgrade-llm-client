// As fontes do olheiro: onde ele olha para saber que um modelo novo saiu.
//
// Duas APIs públicas, sem chave e sem custo:
// - Hugging Face: modelos ABERTOS (os que podemos baixar, ajustar e rodar na nossa CPU).
// - OpenRouter: modelos HOSPEDADOS (com preço por token e se aceitam ferramentas).
//
// Não há modelo de linguagem aqui. "Varrer a internet" virou duas chamadas HTTP e filtros
// escritos: a mesma varredura feita por um agente com busca na web custaria tokens toda semana e
// devolveria uma lista diferente a cada vez. Catálogo é dado estruturado; lê-se com código.
//
// O `fetch` entra por parâmetro: os testes passam um falso, e a lib segue sem tocar em rede
// por conta própria.

export type Buscar = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ModeloAberto {
  id: string;
  autor: string;
  criadoEm: string;
  /** Bilhões de parâmetros; null quando nem a API nem o nome dizem. */
  parametrosB: number | null;
  licenca: string | null;
  tipo: string;
  downloads: number;
  /** De onde veio: lista de autores acompanhados ou a lista de tendência. */
  origem: 'autor' | 'tendencia';
}

export interface ModeloHospedado {
  id: string;
  nome: string;
  criadoEm: string;
  /** USD por 1.000.000 de tokens, a unidade do registro. */
  entradaPorMTok: number;
  saidaPorMTok: number;
  ferramentas: boolean;
  gratis: boolean;
}

export interface Falha {
  fonte: string;
  motivo: string;
}

// Quem publica modelo-base pequeno que vale medir. É dado: acrescentar um laboratório é uma linha.
export const AUTORES = [
  'Qwen', 'google', 'microsoft', 'meta-llama', 'HuggingFaceTB', 'mistralai', 'deepseek-ai',
  'ibm-granite', 'LiquidAI', 'nvidia', 'openbmb', 'tiiuae', 'apple', 'allenai', 'CohereLabs',
];

// Modelo de conversa. O Qwen3.5 pequeno é publicado como imagem+texto, então só
// "text-generation" deixaria de fora justamente a geração nova da família que usamos.
const TIPOS = new Set(['text-generation', 'image-text-to-text', 'any-to-any']);

// Não é modelo novo: é o mesmo modelo em outro formato, ou uma peça de pesquisa.
const DERIVADO = /gguf|fp8|fp4|bf16|gptq|awq|int4|int8|\dbit|onnx|mlx|\bqat\b|-qat-|bnb|unquantized|sae-|-base$/i;

// Modelo de uma tarefa só (ler documento, áudio, moderar, completar código): não é candidato a
// agente de conversa. O filtro é pelo nome, então é grosseiro; o que escapar aparece na lista e
// é descartado por quem lê.
const ESPECIALISTA = /ocr|vision|-vl\b|-v-|audio|omni|embed|guard|rerank|coder|-assistant$/i;

interface CruHF {
  id: string;
  createdAt?: string;
  pipeline_tag?: string;
  downloads?: number;
  safetensors?: { total?: number };
  cardData?: { license?: string; base_model?: string | string[] };
}

/** "Qwen3.5-2B" -> 2; "gemma-3-270m" -> 0.27. O primeiro tamanho que aparece no nome. */
export function tamanhoPeloNome(id: string): number | null {
  const nome = id.split('/').pop() ?? id;
  const m = nome.match(/(?<![A-Za-z\d.])(\d+(?:\.\d+)?)\s*([bm])(?![a-z\d])/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toLowerCase() === 'b' ? n : n / 1000;
}

function tamanho(m: CruHF): number | null {
  // A contagem da API é a mais confiável, mas alguns repositórios publicam um número absurdo
  // (um modelo de 32B com 676 mil parâmetros declarados). Abaixo de 50 M, não conta.
  const total = m.safetensors?.total;
  const pelaApi = total && total > 5e7 ? Math.round((total / 1e9) * 100) / 100 : null;
  const peloNome = tamanhoPeloNome(m.id);
  // Quando os dois existem e discordam muito, vale o MAIOR. Errar para cima só deixa de avisar;
  // errar para baixo anunciaria um modelo de 26B como candidato a degrau menor.
  if (pelaApi && peloNome && Math.max(pelaApi, peloNome) / Math.min(pelaApi, peloNome) > 3) {
    return Math.max(pelaApi, peloNome);
  }
  return pelaApi ?? peloNome;
}

/** Ajuste fino de outro modelo não é modelo-base novo. O instruct sobre o próprio "-Base" é. */
function derivadoDeOutro(m: CruHF): boolean {
  const bases = [m.cardData?.base_model ?? []].flat();
  if (bases.length === 0) return false;
  return !bases.some((b) => b.startsWith(m.id) || m.id.startsWith(b));
}

export function normalizarAberto(m: CruHF, origem: ModeloAberto['origem']): ModeloAberto | null {
  if (!m.id || !m.createdAt) return null;
  if (!m.pipeline_tag || !TIPOS.has(m.pipeline_tag)) return null;
  if (DERIVADO.test(m.id) || ESPECIALISTA.test(m.id) || derivadoDeOutro(m)) return null;
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

/** "fetch failed" sozinho não diz nada; a causa (certificado, DNS, prazo) vem em `cause`. */
function motivoDe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const causa = (e as { cause?: { code?: string; message?: string } }).cause;
  return causa ? `${e.message} (${causa.code ?? causa.message})` : e.message;
}

async function lerLista(buscar: Buscar, url: string): Promise<unknown[]> {
  const r = await buscar(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const corpo = await r.json();
  if (!Array.isArray(corpo)) throw new Error('resposta não é uma lista');
  return corpo;
}

/**
 * Os modelos abertos mais recentes de cada autor acompanhado, mais a lista de tendência.
 *
 * Uma fonte que falha não derruba as outras e NÃO some em silêncio: a falha volta em `falhas` e
 * vai para o relatório. Um relatório vazio porque a API caiu é igual, na tela, a um relatório
 * vazio porque nada saiu, e a diferença é justamente o que o dono precisa saber.
 */
export async function buscarAbertos(
  buscar: Buscar,
  autores: string[] = AUTORES,
): Promise<{ modelos: ModeloAberto[]; falhas: Falha[] }> {
  const falhas: Falha[] = [];
  const vistos = new Map<string, ModeloAberto>();
  const base = 'https://huggingface.co/api/models';

  const consultas: [string, string, ModeloAberto['origem']][] = [
    ...autores.map(
      (a): [string, string, ModeloAberto['origem']] => [
        `huggingface:${a}`,
        `${base}?author=${a}&sort=createdAt&direction=-1&limit=100&${CAMPOS}`,
        'autor',
      ],
    ),
    // Pega laboratório que ainda não está na lista de autores.
    ['huggingface:tendencia', `${base}?pipeline_tag=text-generation&sort=trendingScore&direction=-1&limit=100&${CAMPOS}`, 'tendencia'],
  ];

  for (const [fonte, url, origem] of consultas) {
    try {
      for (const cru of await lerLista(buscar, url)) {
        const m = normalizarAberto(cru as CruHF, origem);
        if (m && !vistos.has(m.id)) vistos.set(m.id, m);
      }
    } catch (e) {
      falhas.push({ fonte, motivo: motivoDe(e) });
    }
  }
  return { modelos: [...vistos.values()], falhas };
}

interface CruOR {
  id: string;
  name?: string;
  created?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
}

export async function buscarHospedados(buscar: Buscar): Promise<{ modelos: ModeloHospedado[]; falhas: Falha[] }> {
  try {
    const r = await buscar('https://openrouter.ai/api/v1/models');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const corpo = (await r.json()) as { data?: CruOR[] };
    if (!Array.isArray(corpo.data)) throw new Error('resposta sem `data`');
    const modelos = corpo.data
      // Preço negativo é roteador ("openrouter/auto"): quem cobra é o modelo que ele escolher.
      .filter((m) => m.id && m.created && !m.id.endsWith(':batch') && Number(m.pricing?.prompt ?? 0) >= 0)
      .map((m): ModeloHospedado => {
        const entrada = Number(m.pricing?.prompt ?? 0) * 1e6;
        const saida = Number(m.pricing?.completion ?? 0) * 1e6;
        return {
          id: m.id,
          nome: m.name ?? m.id,
          criadoEm: new Date(m.created! * 1000).toISOString().slice(0, 10),
          entradaPorMTok: Math.round(entrada * 1000) / 1000,
          saidaPorMTok: Math.round(saida * 1000) / 1000,
          ferramentas: (m.supported_parameters ?? []).includes('tools'),
          gratis: entrada === 0 && saida === 0,
        };
      });
    return { modelos, falhas: [] };
  } catch (e) {
    return { modelos: [], falhas: [{ fonte: 'openrouter', motivo: motivoDe(e) }] };
  }
}
