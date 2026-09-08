import { resolveRole, modelCatalog, roles, Role } from '../models/registry';
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
      { model: 'claude-sonnet-5', provider: 'anthropic' },
      { model: 'gpt-4o', provider: 'openai' },
    ]);
  });

  it('aplica o override do produto quando existe', () => {
    // agenteup atende lead em gpt-4o desde antes do registro. O override existe
    // para a migração não mudar comportamento por acidente.
    expect(resolveRole('conversa', 'AGENTEUP')[0].model).toBe('gpt-4o');
    expect(resolveRole('conversa', 'CONTENTSELLER')[0].model).toBe('claude-sonnet-5');
  });

  it('a forma do retorno serve direto para completeWithFallback', () => {
    // FallbackStep menos a apiKey — a lib nunca lê chave sozinha, e o registro
    // não muda isso: ele diz QUAL modelo, nunca com que credencial.
    for (const passo of resolveRole('redacao')) {
      expect(Object.keys(passo).sort()).toEqual(['model', 'provider']);
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
