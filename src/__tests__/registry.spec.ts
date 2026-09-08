import { resolveRole, modelCatalog, roles, providerIds, requiredEnvKeys, providerSpecOf } from '../models/registry';
import { providerSpecDe } from '../core/complete';
import registry from '../models/models.json';

/**
 * O registro central de modelos.
 *
 * O que ele existe para impedir: um identificador de modelo cravado em oito
 * repositórios, que só se descobre estar desatualizado quando alguém varre tudo
 * com grep. Em 08/09/2026 a varredura achou ~70 ocorrências, o emailseller
 * parado em sonnet-4-6 e um opus-4-5 solto que ninguém sabia que existia.
 *
 * O que ele NÃO pode causar: trocar um motor medido. Esse é o erro caro, porque
 * é silencioso — o produto continua respondendo, medindo outra coisa.
 */

describe('resolveRole', () => {
  it('devolve a cascata na ordem, com o provedor de cada modelo', () => {
    expect(resolveRole('conversa')).toEqual([
      { model: 'claude-sonnet-5', provider: 'anthropic', providerSpec: { api: 'anthropic' } },
      { model: 'gpt-4o', provider: 'openai', providerSpec: { api: 'openai-compatible' } },
    ]);
  });

  it('os três nativos não ganham baseUrl — a URL padrão do SDK é a certa', () => {
    // Se aparecesse baseUrl aqui, o caminho que roda em produção nos quatro
    // produtos teria mudado. A mudança é aditiva de propósito.
    for (const passo of resolveRole('classificacao')) {
      expect(passo.providerSpec.baseUrl).toBeUndefined();
    }
    expect(resolveRole('classificacao')[1].providerSpec.sdk).toBe('groq');
  });

  it('aplica o override do produto quando existe', () => {
    // agenteup atende lead em gpt-4o desde antes do registro. O override existe
    // para a migração não mudar comportamento por acidente.
    expect(resolveRole('conversa', 'AGENTEUP')[0].model).toBe('gpt-4o');
    expect(resolveRole('conversa', 'CONTENTSELLER')[0].model).toBe('claude-sonnet-5');
  });

  it('a forma do retorno serve direto para completeWithFallback', () => {
    // FallbackStep menos a apiKey — a lib nunca lê chave sozinha, e o registro
    // não muda isso: ele diz QUAL modelo, de qual provedor e por qual URL,
    // nunca com que credencial.
    for (const passo of resolveRole('redacao')) {
      expect(Object.keys(passo).sort()).toEqual(['model', 'provider', 'providerSpec']);
    }
  });

  it('recusa override sem razão escrita', () => {
    const original = JSON.parse(JSON.stringify(registry.products));
    (registry.products as Record<string, unknown>).GOLDANALYZER = {
      roles: { conversa: { cascade: ['gpt-4o'] } },
    };
    try {
      expect(() => resolveRole('conversa', 'GOLDANALYZER')).toThrow(/reason/);
    } finally {
      (registry as { products: unknown }).products = original;
    }
  });
});

describe('motor medido', () => {
  // hadrians pergunta ao Gemini o que o Gemini responde sobre a marca do
  // cliente. Trocar esse modelo não melhora nada: muda O QUE ESTÁ SENDO MEDIDO
  // e torna os snapshots históricos incomparáveis. O produto continuaria
  // funcionando — é exatamente por isso que a trava precisa ser barulhenta.
  it('nunca atende um papel', () => {
    const original = JSON.parse(JSON.stringify(registry.roles.classificacao.cascade));
    registry.roles.classificacao.cascade = ['gemini-2.0-flash'];
    try {
      expect(() => resolveRole('classificacao')).toThrow(/motor medido/);
    } finally {
      registry.roles.classificacao.cascade = original;
    }
  });

  it('nenhum papel de verdade aponta para um só hoje', () => {
    for (const papel of roles()) {
      expect(() => resolveRole(papel)).not.toThrow();
    }
  });

  it('mas continua no catálogo, porque gera custo', () => {
    const gemini = modelCatalog().find((m) => m.model === 'gemini-2.0-flash');
    expect(gemini).toEqual({ model: 'gemini-2.0-flash', provider: 'google', measuredEngine: true });
  });
});

describe('integridade do arquivo', () => {
  it('toda cascata referencia modelo que existe no catálogo', () => {
    const conhecidos = new Set(modelCatalog().map((m) => m.model));
    const cascatas: [string, string[]][] = [
      ...Object.entries(registry.roles).map(
        ([papel, r]) => [`roles.${papel}`, r.cascade] as [string, string[]],
      ),
      ...Object.entries(registry.products).flatMap(([produto, p]) =>
        Object.entries(p.roles ?? {}).map(
          ([papel, r]) => [`products.${produto}.${papel}`, r.cascade] as [string, string[]],
        ),
      ),
    ];

    for (const [onde, cascata] of cascatas) {
      for (const modelo of cascata) {
        expect({ onde, modelo, existe: conhecidos.has(modelo) }).toEqual({ onde, modelo, existe: true });
      }
    }
  });

  it('todo override de produto tem razão escrita', () => {
    for (const [produto, p] of Object.entries(registry.products)) {
      for (const [papel, r] of Object.entries(p.roles ?? {})) {
        expect({ produto, papel, temRazao: typeof r.reason === 'string' && r.reason.length > 20 })
          .toEqual({ produto, papel, temRazao: true });
      }
    }
  });

  it('embedding tem cascata de um elemento só', () => {
    // Cair para outro modelo de embedding produz vetores de outro espaço, que
    // não são comparáveis com os já indexados. A busca não falha: devolve
    // resultado errado em silêncio.
    expect(resolveRole('embedding')).toHaveLength(1);
  });

  it('cada produto do registro é um Product conhecido pela lib', () => {
    const PRODUTOS = ['HADRIANS', 'GOLDANALYZER', 'ALFABETIA', 'AGENTEUP', 'CONTENTSELLER', 'EMAILSELLER'];
    for (const produto of Object.keys(registry.products)) {
      expect(PRODUTOS).toContain(produto);
    }
  });
});

describe('as divergências do levantamento', () => {
  // Não são decoração: cada uma é um item de migração. Ficam versionadas para
  // a próxima sessão saber o que estava aberto, e somem quando forem
  // resolvidas.
  it('estão registradas com onde, o quê e risco', () => {
    // `_sobre` é texto e não item — o prefixo separa os dois, e o cast diz ao
    // compilador o que o filtro já garantiu.
    type Item = { onde: string; o_que: string; risco: string };
    const itens = Object.entries(registry.divergences).filter(([k]) => !k.startsWith('_')) as [string, Item][];
    expect(itens.length).toBeGreaterThan(0);
    for (const [nome, d] of itens) {
      expect({ nome, completo: Boolean(d.onde && d.o_que && d.risco) }).toEqual({ nome, completo: true });
    }
  });

  it('gemini-2.0-flash está entre elas — roda em produção sem preço', () => {
    expect(registry.divergences.geminiSemPreco.onde).toMatch(/hadrians/);
  });
});

describe('provedor é dado, não código', () => {
  // O que isto destrava: antes, "trocar Kimi por DeepSeek" era editar um union
  // fechado em TypeScript e o getClient do adapter — mudança de código em oito
  // repos. Agora é uma entrada em providers, com baseUrl.
  it('declara os provedores OpenAI-compatíveis que ainda não estão em uso', () => {
    const ids = providerIds().map((p) => p.id);
    for (const novo of ['deepseek', 'moonshot', 'together', 'fireworks', 'openrouter']) {
      expect(ids).toContain(novo);
    }
  });

  it('nenhum papel aponta para provedor cuja baseUrl não foi conferida', () => {
    // baseUrl escrita de memória não vai para produção por acidente: confirmar
    // na doc e marcar `verified` é um passo consciente, com alguém tendo
    // olhado. É o mesmo cuidado que o models.yaml do VanguardAI registra —
    // catálogo e URL de provedor mudam sem aviso, e em 2026-08-09 dois slugs
    // de lá tinham sumido do catálogo do provedor.
    for (const papel of roles()) {
      for (const passo of resolveRole(papel)) {
        const p = providerIds().find((x) => x.id === passo.provider);
        expect({ papel, provider: passo.provider, verified: p?.verified }).toEqual({
          papel,
          provider: passo.provider,
          verified: true,
        });
      }
    }
  });

  it('apontar um papel para provedor não conferido falha com a razão', () => {
    const original = JSON.parse(JSON.stringify(registry.models));
    (registry.models as Record<string, unknown>)['deepseek-chat'] = { provider: 'deepseek' };
    const cascataOriginal = registry.roles.raciocinio.cascade;
    registry.roles.raciocinio.cascade = ['deepseek-chat'];
    try {
      expect(() => resolveRole('raciocinio')).toThrow(/verified: false/);
    } finally {
      registry.roles.raciocinio.cascade = cascataOriginal;
      (registry as { models: unknown }).models = original;
    }
  });

  it('depois de conferido, o provedor novo vem com baseUrl pronta para uso', () => {
    // Este é o ponto inteiro do passo: nenhuma linha de TypeScript muda para o
    // DeepSeek passar a funcionar — só o JSON.
    const modelosOriginais = JSON.parse(JSON.stringify(registry.models));
    const verificadoOriginal = registry.providers.deepseek.verified;
    const cascataOriginal = registry.roles.raciocinio.cascade;

    (registry.models as Record<string, unknown>)['deepseek-chat'] = { provider: 'deepseek' };
    registry.providers.deepseek.verified = true;
    registry.roles.raciocinio.cascade = ['deepseek-chat'];
    try {
      expect(resolveRole('raciocinio')).toEqual([
        {
          model: 'deepseek-chat',
          provider: 'deepseek',
          providerSpec: { api: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1' },
        },
      ]);
      expect(requiredEnvKeys('raciocinio')).toEqual(['DEEPSEEK_API_KEY']);
    } finally {
      registry.roles.raciocinio.cascade = cascataOriginal;
      registry.providers.deepseek.verified = verificadoOriginal;
      (registry as { models: unknown }).models = modelosOriginais;
    }
  });
});

describe('requiredEnvKeys', () => {
  // Serve para o produto conferir na SUBIDA o que falta. É assim que uma troca
  // de provedor costuma dar errado: o código novo sobe, e só o primeiro cliente
  // a passar por aquele caminho descobre que a chave não existe naquele
  // ambiente.
  it('devolve o nome da variável, nunca o valor', () => {
    expect(requiredEnvKeys('conversa')).toEqual(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
  });

  it('não repete quando a cascata inteira é do mesmo provedor', () => {
    expect(requiredEnvKeys('conversa', 'AGENTEUP')).toEqual(['OPENAI_API_KEY']);
  });
});

describe('providerSpecDe (compatibilidade)', () => {
  // Os quatro produtos em produção chamam complete() com 'anthropic',
  // 'openai' ou 'groq' e nenhum providerSpec. Nada disso pode ter mudado.
  it('os três nativos seguem funcionando sem spec', () => {
    expect(providerSpecDe({ provider: 'anthropic' })).toEqual({ api: 'anthropic' });
    expect(providerSpecDe({ provider: 'openai' })).toEqual({ api: 'openai-compatible' });
    expect(providerSpecDe({ provider: 'groq' })).toEqual({ api: 'openai-compatible', sdk: 'groq' });
  });

  it('provedor novo sem spec falha na hora, dizendo o nome', () => {
    // Adivinhar URL de provedor é chute que só se descobre em produção.
    expect(() => providerSpecDe({ provider: 'deepseek' })).toThrow(/deepseek/);
    expect(() => providerSpecDe({ provider: 'deepseek' })).toThrow(/providerSpec/);
  });

  it('provedor do catálogo que o cliente não fala é recusado com a razão', () => {
    expect(() => providerSpecDe({ provider: 'google', providerSpec: providerSpecOf('google') }))
      .toThrow(/não fala com ele/);
  });
});
