import {
  carregarRegistro, fonteDoRegistro, redefinirRegistro, registroAtual,
} from '../models/carregar';
import { resolveRole, registryVersion, REGISTRY_VERSION } from '../models/registry';

/**
 * A busca do registro no boot.
 *
 * Tudo aqui existe por causa de uma frase: **coletor fora do ar nunca pode
 * impedir um produto de atender cliente.** Um produto que não sobe porque o
 * serviço de faturamento caiu é um estrago muito maior do que rodar com a
 * configuração da semana passada.
 */

const REGISTRO_NOVO = {
  version: 7,
  providers: {
    anthropic: { api: 'anthropic', envKey: 'ANTHROPIC_API_KEY', verified: true },
    openai: { api: 'openai-compatible', envKey: 'OPENAI_API_KEY', verified: true },
    groq: { api: 'openai-compatible', sdk: 'groq', envKey: 'GROQ_API_KEY', verified: true },
    deepseek: {
      api: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      envKey: 'DEEPSEEK_API_KEY',
      verified: true,
    },
  },
  models: {
    'claude-sonnet-5': { provider: 'anthropic' },
    'gpt-4o': { provider: 'openai' },
    'gpt-4o-mini': { provider: 'openai' },
    'gpt-oss-20b': { provider: 'groq' },
    'text-embedding-3-small': { provider: 'openai' },
    'whisper-1': { provider: 'openai' },
    'dall-e-3': { provider: 'openai' },
    'claude-opus-5': { provider: 'anthropic' },
    'deepseek-chat': { provider: 'deepseek' },
  },
  roles: {
    conversa: { description: 'Atendimento.', cascade: ['deepseek-chat', 'claude-sonnet-5'] },
    redacao: { description: 'Texto.', cascade: ['claude-sonnet-5'] },
    raciocinio: { description: 'Caro.', cascade: ['claude-opus-5'] },
    classificacao: { description: 'Triagem.', cascade: ['gpt-4o-mini', 'gpt-oss-20b'] },
    visao: { description: 'Imagem.', cascade: ['gpt-4o'] },
    embedding: { description: 'Vetores.', cascade: ['text-embedding-3-small'] },
    transcricao: { description: 'Áudio.', cascade: ['whisper-1'] },
    imagem: { description: 'Gerar imagem.', cascade: ['dall-e-3'] },
  },
  products: {},
};

const OPCOES = { collectorUrl: 'https://ai-usage.upgradese.com.br', apiKey: 'chave-do-produto' };

const respondeCom = (status: number, corpo?: unknown) =>
  jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => corpo }));

beforeEach(() => {
  redefinirRegistro();
  jest.restoreAllMocks();
});

afterAll(() => redefinirRegistro());

describe('quando o coletor responde', () => {
  it('passa a usar a edição publicada', async () => {
    global.fetch = respondeCom(200, { version: 7, content: REGISTRO_NOVO }) as never;

    const r = await carregarRegistro(OPCOES);

    expect(r).toEqual({ fonte: 'coletor', version: 7 });
    expect(fonteDoRegistro()).toBe('coletor');
    expect(registryVersion()).toBe(7);
  });

  it('e resolveRole passa a responder pela edição nova, sem recompilar nada', async () => {
    // É o ponto inteiro do passo: trocar o modelo do atendimento para DeepSeek
    // virou uma edição publicada no console, não um deploy em seis produtos.
    global.fetch = respondeCom(200, { version: 7, content: REGISTRO_NOVO }) as never;
    await carregarRegistro(OPCOES);

    expect(resolveRole('conversa')[0]).toEqual({
      model: 'deepseek-chat',
      provider: 'deepseek',
      providerSpec: { api: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1' },
    });
  });

  it('manda a chave do produto, e nada além dela', async () => {
    const fetchFalso = respondeCom(200, { version: 7, content: REGISTRO_NOVO });
    global.fetch = fetchFalso as never;

    await carregarRegistro(OPCOES);

    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai-usage.upgradese.com.br/registry');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('chave-do-produto');
  });
});

describe('quando o coletor falha', () => {
  const casos: [string, () => void, RegExp][] = [
    ['404 — ainda não há edição publicada', () => { global.fetch = respondeCom(404) as never; }, /404/],
    ['500', () => { global.fetch = respondeCom(500) as never; }, /500/],
    ['rede caiu', () => { global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED'); }) as never; }, /ECONNREFUSED/],
    ['JSON quebrado', () => {
      global.fetch = jest.fn(async () => ({
        ok: true, status: 200, json: async () => { throw new Error('Unexpected token'); },
      })) as never;
    }, /Unexpected token/],
  ];

  it.each(casos)('%s: cai na cópia compilada, sem lançar', async (_nome, preparar, motivo) => {
    preparar();

    const r = await carregarRegistro(OPCOES);

    expect(r.fonte).toBe('compilado');
    expect(r.motivo).toMatch(motivo);
    expect(r.version).toBe(REGISTRY_VERSION);
    // E o produto continua funcionando: é a única coisa que importa aqui.
    expect(resolveRole('conversa').length).toBeGreaterThan(0);
  });

  it('coletor pendurado não segura o boot para sempre', async () => {
    // Um coletor que aceita a conexão e não responde é pior que um fora do ar:
    // sem prazo, o produto fica subindo indefinidamente e nenhum healthcheck
    // acusa, porque o processo está vivo.
    global.fetch = jest.fn((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      })) as never;

    const r = await carregarRegistro({ ...OPCOES, timeoutMs: 20 });

    expect(r.fonte).toBe('compilado');
    expect(r.motivo).toMatch(/não respondeu em 20ms/);
  });

  it('avisa quem chamou, para a troca de fonte não ser invisível', async () => {
    // Sem isto, "por que este produto está usando o modelo antigo?" vira
    // investigação. Com isto, é uma linha de log no boot.
    global.fetch = respondeCom(503) as never;
    const avisos: unknown[] = [];

    await carregarRegistro({ ...OPCOES, aoTerminar: (r) => avisos.push(r) });

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ fonte: 'compilado', motivo: expect.stringContaining('503') });
  });
});

describe('o que chega pela rede é conferido antes de valer', () => {
  // Um registro incoerente vindo da rede é PIOR que o compilado: o compilado ao
  // menos foi revisado quando entrou no pacote.
  const ruins: [string, unknown, RegExp][] = [
    ['não é objeto', 'texto', /não é objeto/],
    ['sem version', { ...REGISTRO_NOVO, version: undefined }, /sem version/],
    ['sem models', { ...REGISTRO_NOVO, models: undefined }, /sem models/],
    ['nenhum papel', { ...REGISTRO_NOVO, roles: {} }, /nenhum papel/],
    ['papel apontando para modelo que não existe', {
      ...REGISTRO_NOVO,
      roles: { ...REGISTRO_NOVO.roles, conversa: { description: 'x', cascade: ['modelo-fantasma'] } },
    }, /modelo inexistente/],
    ['modelo apontando para provedor que não existe', {
      ...REGISTRO_NOVO,
      models: { ...REGISTRO_NOVO.models, 'claude-sonnet-5': { provider: 'provedor-fantasma' } },
    }, /provedor inexistente/],
  ];

  it.each(ruins)('%s: recusa e mantém o compilado', async (_nome, content, motivo) => {
    global.fetch = respondeCom(200, { version: 9, content }) as never;

    const r = await carregarRegistro(OPCOES);

    expect(r.fonte).toBe('compilado');
    expect(r.motivo).toMatch(motivo);
  });

  it('papel que sumiu do coletor é recusado', async () => {
    // Publicar uma edição sem o papel `transcricao` derrubaria todo produto que
    // já o usa — e derrubaria no boot seguinte deles, longe de quem publicou.
    // Melhor o produto seguir com a configuração antiga e alguém perceber a
    // falta pelo log do que seis produtos caírem em horários aleatórios.
    const semTranscricao = { ...REGISTRO_NOVO, roles: { ...REGISTRO_NOVO.roles } };
    delete (semTranscricao.roles as Record<string, unknown>).transcricao;
    global.fetch = respondeCom(200, { version: 9, content: semTranscricao }) as never;

    const r = await carregarRegistro(OPCOES);

    expect(r.fonte).toBe('compilado');
    expect(r.motivo).toMatch(/o papel "transcricao" sumiu/);
  });
});

describe('sem chamar carregarRegistro', () => {
  it('a lib funciona pela cópia compilada, como antes de tudo isso existir', () => {
    // Migração de produto é uma de cada vez. Quem ainda não chama isto no boot
    // não pode ter mudado de comportamento.
    expect(fonteDoRegistro()).toBe('compilado');
    expect(registryVersion()).toBe(REGISTRY_VERSION);
    expect(resolveRole('conversa')[0].model).toBe('claude-sonnet-5');
  });

  it('nenhuma chamada de rede acontece sozinha', async () => {
    // A busca é explícita de propósito: buscar na primeira chamada de
    // resolveRole poria uma ida à rede dentro do caminho de uma resposta ao
    // cliente.
    const fetchFalso = jest.fn();
    global.fetch = fetchFalso as never;

    resolveRole('conversa');
    resolveRole('classificacao', 'AGENTEUP');

    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe('registroAtual', () => {
  it('devolve o documento em uso, para quem quiser inspecionar', async () => {
    global.fetch = respondeCom(200, { version: 7, content: REGISTRO_NOVO }) as never;
    await carregarRegistro(OPCOES);
    expect(registroAtual().version).toBe(7);
  });
});
