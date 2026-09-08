import compilado from './models.json';

/**
 * Busca o registro publicado no coletor, no BOOT do produto.
 *
 * O ponto inteiro deste arquivo é uma frase: **coletor fora do ar nunca pode
 * impedir um produto de atender cliente.** Tudo aqui é consequência dela.
 *
 * - Nunca lança. Qualquer falha — rede, 404, JSON quebrado, coletor pendurado —
 *   cai na cópia compilada que veio dentro do pacote.
 * - Tem prazo. Um coletor que aceita a conexão e não responde seguraria o boot
 *   do produto para sempre; o `AbortController` corta.
 * - É explícito. Não busca sozinho na primeira chamada de `resolveRole`, porque
 *   isso poria uma chamada de rede dentro do caminho de uma resposta ao
 *   cliente. Quem sobe o produto chama isto uma vez, no boot, e pronto.
 *
 * Enquanto ninguém chamar, `resolveRole` usa a cópia compilada — que é o
 * comportamento de antes deste arquivo existir.
 */

export type FonteDoRegistro = 'compilado' | 'coletor';

export interface Registro {
  version: number;
  providers: Record<string, { api?: string; baseUrl?: string; sdk?: string; envKey: string; verified: boolean }>;
  models: Record<string, { provider: string; measuredEngine?: boolean }>;
  roles: Record<string, { description: string; cascade: string[] }>;
  products: Record<string, { roles?: Record<string, { cascade: string[]; reason?: string }> }>;
}

export interface CarregarOpcoes {
  /** Base do coletor, ex: https://ai-usage.upgradese.com.br */
  collectorUrl: string;
  /** A mesma chave de produto que o reporter usa. */
  apiKey: string;
  /** Prazo para o coletor responder. Curto de propósito: é boot. */
  timeoutMs?: number;
  /** Recebe o que aconteceu. Sem isto a troca de fonte é invisível. */
  aoTerminar?: (r: ResultadoDaCarga) => void;
}

export interface ResultadoDaCarga {
  fonte: FonteDoRegistro;
  version: number;
  /** Preenchido só quando caiu para o compilado, dizendo por quê. */
  motivo?: string;
}

const TIMEOUT_PADRAO_MS = 3000;

let atual: Registro = compilado as unknown as Registro;
let fonte: FonteDoRegistro = 'compilado';

/** O registro em uso agora. */
export function registroAtual(): Registro {
  return atual;
}

/**
 * De onde veio o registro em uso.
 *
 * Vale logar no boot. Sem isto, "por que este produto está usando o modelo
 * antigo?" vira investigação; com isto, é uma linha de log.
 */
export function fonteDoRegistro(): FonteDoRegistro {
  return fonte;
}

/** Volta para a cópia compilada. Existe para teste, não para produção. */
export function redefinirRegistro(): void {
  atual = compilado as unknown as Registro;
  fonte = 'compilado';
}

export async function carregarRegistro(opcoes: CarregarOpcoes): Promise<ResultadoDaCarga> {
  const resultado = await buscar(opcoes);
  opcoes.aoTerminar?.(resultado);
  return resultado;
}

async function buscar(opcoes: CarregarOpcoes): Promise<ResultadoDaCarga> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS);

  try {
    const resposta = await fetch(new URL('/registry', opcoes.collectorUrl).toString(), {
      headers: { 'x-api-key': opcoes.apiKey },
      signal: controle.signal,
    });

    if (!resposta.ok) {
      // 404 é o caso esperado quando ainda não há edição publicada. Não é erro
      // de configuração do produto: é o coletor dizendo "use a sua cópia".
      return cair(`coletor respondeu ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as { version?: number; content?: unknown };
    const problema = porQueNaoServe(corpo?.content);
    if (problema) {
      // Um registro incoerente vindo da rede é PIOR que o compilado: o
      // compilado ao menos foi revisado quando entrou no pacote.
      return cair(`registro recebido não serve: ${problema}`);
    }

    atual = corpo.content as Registro;
    fonte = 'coletor';
    return { fonte: 'coletor', version: atual.version };
  } catch (err) {
    const motivo = controle.signal.aborted
      ? `coletor não respondeu em ${opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS}ms`
      : `falha ao buscar: ${(err as Error)?.message ?? 'desconhecida'}`;
    return cair(motivo);
  } finally {
    clearTimeout(prazo);
  }
}

function cair(motivo: string): ResultadoDaCarga {
  redefinirRegistro();
  return { fonte: 'compilado', version: atual.version, motivo };
}

/**
 * Por que este registro não pode ser usado, ou null se pode.
 *
 * Não é a validação completa — essa vive no coletor, onde dispara ao salvar,
 * com alguém olhando a tela. Aqui é a última linha: recusar o que chegou pela
 * rede e que deixaria o produto de pé sem conseguir escolher um modelo.
 *
 * Checa o que quebra produto, e só isso. Um registro que passa aqui e tem uma
 * imperfeição cosmética é melhor aceito que rejeitado — rejeitar demais
 * significa produto rodando com configuração velha sem ninguém saber.
 */
function porQueNaoServe(bruto: unknown): string | null {
  if (!bruto || typeof bruto !== 'object') return 'não é objeto';

  const r = bruto as Partial<Registro>;
  if (typeof r.version !== 'number') return 'sem version';
  for (const campo of ['providers', 'models', 'roles'] as const) {
    if (!r[campo] || typeof r[campo] !== 'object') return `sem ${campo}`;
  }
  if (Object.keys(r.roles!).length === 0) return 'nenhum papel';

  for (const [papel, def] of Object.entries(r.roles!)) {
    const cascata = def?.cascade;
    if (!Array.isArray(cascata) || cascata.length === 0) return `papel "${papel}" sem cascata`;
    for (const id of cascata) {
      const modelo = r.models![id];
      if (!modelo) return `papel "${papel}" aponta para o modelo inexistente "${id}"`;
      if (!r.providers![modelo.provider]) {
        return `modelo "${id}" aponta para o provedor inexistente "${modelo.provider}"`;
      }
    }
  }

  // Papel que existe no compilado e sumiu do recebido derrubaria todo produto
  // que já o usa — e derrubaria no boot seguinte, longe de quem publicou.
  for (const papel of Object.keys((compilado as unknown as Registro).roles)) {
    if (!r.roles![papel]) return `o papel "${papel}" sumiu do registro recebido`;
  }

  return null;
}
