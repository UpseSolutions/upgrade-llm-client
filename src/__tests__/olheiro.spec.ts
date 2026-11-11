import dados from '../olheiro/escadas.json';
import { buscarAbertos, buscarHospedados, normalizarAberto, tamanhoPeloNome, type Buscar } from '../olheiro/fontes';
import { classificarLicenca, OPCOES_PADRAO, relatorio, triar } from '../olheiro/olheiro';
import { pisoDoPapel, vereditoDoDegrau, type Criterio, type Degrau, type Escada } from '../olheiro/piso';

const criterio = dados.criterio as unknown as Criterio;
const escadas = dados.escadas as unknown as Record<string, Escada>;

const degrau = (base: string, parametrosB: number, ...notas: Record<string, number>[]): Degrau => ({
  base,
  parametrosB,
  rodadas: notas.map((n, i) => ({ versao: `v${i + 1}`, em: '2026-11-10', notas: n })),
});

describe('veredito do degrau (o modelo está no limite?)', () => {
  it('aprova pela PIOR prova, não pela média', () => {
    expect(vereditoDoDegrau(degrau('a', 4, { x: 1, y: 0.96 }), criterio).veredito).toBe('aprovado');
    // média 0,97, mas uma prova em 0,90
    expect(vereditoDoDegrau(degrau('a', 4, { x: 1, y: 1, z: 1, w: 0.9 }), criterio).veredito).toBe('em_aberto');
  });

  it('uma rodada ruim só não prova o limite', () => {
    expect(vereditoDoDegrau(degrau('a', 1.7, { x: 0.8 }), criterio).veredito).toBe('em_aberto');
  });

  it('duas rodadas sem a pior prova subir: no limite, e diz que os erros mudaram de lugar', () => {
    const v = vereditoDoDegrau(degrau('a', 1.7, { x: 0.85, y: 0.91 }, { x: 0.89, y: 0.78 }), criterio);
    expect(v.veredito).toBe('no_limite');
    expect(v.motivo).toContain('mudaram de lugar');
    expect(v.motivo).toContain('x +4');
    expect(v.motivo).toContain('y -13');
  });

  it('segunda rodada que sobe a pior prova de verdade segue em aberto', () => {
    const v = vereditoDoDegrau(degrau('a', 1.7, { x: 0.8, y: 0.9 }, { x: 0.88, y: 0.9 }), criterio);
    expect(v.veredito).toBe('em_aberto');
    expect(v.motivo).toContain('ainda melhorando');
  });

  it('voltar ao que já era não conta como progresso (compara com a MELHOR rodada anterior)', () => {
    const v = vereditoDoDegrau(degrau('a', 1.7, { x: 0.85 }, { x: 0.7 }, { x: 0.85 }), criterio);
    expect(v.veredito).toBe('no_limite');
  });
});

describe('piso do papel (já achamos o menor?)', () => {
  it('provisório enquanto nenhum degrau menor foi testado', () => {
    const p = pisoDoPapel({ degraus: [degrau('grande', 4, { x: 1 })] }, criterio);
    expect(p.estado).toBe('provisorio');
    expect(p.piso?.base).toBe('grande');
  });

  it('provisório enquanto o degrau de baixo está em aberto', () => {
    const p = pisoDoPapel({ degraus: [degrau('grande', 4, { x: 1 }), degrau('pequeno', 1.7, { x: 0.8 })] }, criterio);
    expect(p.estado).toBe('provisorio');
  });

  it('provado quando o degrau de baixo chegou ao limite', () => {
    const p = pisoDoPapel(
      { degraus: [degrau('grande', 4, { x: 1 }), degrau('pequeno', 1.7, { x: 0.85 }, { x: 0.8 })] },
      criterio,
    );
    expect(p.estado).toBe('provado');
    expect(p.piso?.base).toBe('grande');
  });

  it('o piso é o MENOR aprovado, qualquer que seja a ordem no arquivo', () => {
    const p = pisoDoPapel({ degraus: [degrau('grande', 8, { x: 1 }), degrau('medio', 4, { x: 0.97 })] }, criterio);
    expect(p.piso?.base).toBe('medio');
  });

  it('sem piso quando nada passou', () => {
    expect(pisoDoPapel({ degraus: [degrau('a', 4, { x: 0.5 })] }, criterio).estado).toBe('sem_piso');
  });

  it('dados reais: atendimento_agenda tem piso provado no 4B e o 1,7B no limite', () => {
    const p = pisoDoPapel(escadas.atendimento_agenda, criterio);
    expect(p.estado).toBe('provado');
    expect(p.piso?.base).toBe('Qwen/Qwen3-4B');
    expect(p.degraus.find((d) => d.base === 'Qwen/Qwen3-1.7B')?.veredito).toBe('no_limite');
  });

  it('toda nota de escadas.json está entre 0 e 1 e toda rodada tem data', () => {
    for (const escada of Object.values(escadas)) {
      for (const d of escada.degraus) {
        for (const r of d.rodadas) {
          expect(r.em).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          for (const nota of Object.values(r.notas)) {
            expect(nota).toBeGreaterThanOrEqual(0);
            expect(nota).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('fontes', () => {
  const cru = (id: string, extra: object = {}) => ({
    id,
    createdAt: '2026-11-08T00:00:00.000Z',
    pipeline_tag: 'text-generation',
    downloads: 10000,
    safetensors: { total: 2_000_000_000 },
    cardData: { license: 'apache-2.0' },
    ...extra,
  });

  it('lê o tamanho pelo nome quando a contagem falta ou é absurda', () => {
    expect(tamanhoPeloNome('Qwen/Qwen3.5-2B')).toBe(2);
    expect(tamanhoPeloNome('google/gemma-3-270m-it')).toBe(0.27);
    expect(tamanhoPeloNome('Qwen/Qwen3.5-0.8B')).toBe(0.8);
    expect(tamanhoPeloNome('org/sem-tamanho')).toBeNull();
    // o nome diz 26B e a API diz 420 M: vale o maior, para não anunciar um degrau menor que não existe
    expect(normalizarAberto(cru('org/M-26B-A4B-it', { safetensors: { total: 420_000_000 } }), 'autor')?.parametrosB).toBe(26);
    expect(normalizarAberto(cru('org/Novo-4B', { safetensors: { total: 676864 } }), 'autor')?.parametrosB).toBe(4);
  });

  it('descarta outro formato do mesmo modelo, peça de pesquisa e ajuste fino de terceiros', () => {
    for (const id of [
      'org/M-2B-GGUF', 'org/M-2B-FP8', 'org/M-2B-GPTQ-Int4', 'org/M-2B-Base', 'org/SAE-Res-M-2B',
      'org/M-4B-NVFP4', 'org/M-2B-MLX-5bit', 'org/M-OCR-2', 'org/M-vision-4b', 'org/M-31B-it-assistant',
    ]) {
      expect(normalizarAberto(cru(id), 'autor')).toBeNull();
    }
    expect(normalizarAberto(cru('org/Dirigir-4B', { cardData: { base_model: ['org/M-4B'] } }), 'autor')).toBeNull();
    expect(normalizarAberto(cru('org/imagem', { pipeline_tag: 'text-to-image' }), 'autor')).toBeNull();
  });

  it('mantém o instruct publicado sobre o próprio -Base e o modelo de imagem+texto', () => {
    const m = normalizarAberto(
      cru('Qwen/Qwen3.5-2B', { pipeline_tag: 'image-text-to-text', cardData: { license: 'apache-2.0', base_model: ['Qwen/Qwen3.5-2B-Base'] } }),
      'autor',
    );
    expect(m?.id).toBe('Qwen/Qwen3.5-2B');
  });

  it('uma fonte que cai não derruba as outras e aparece em `falhas`', async () => {
    const buscar: Buscar = async (url) => {
      if (url.includes('author=ruim')) return { ok: false, status: 503, json: async () => ({}) };
      if (url.includes('author=bom')) return { ok: true, status: 200, json: async () => [cru('bom/Novo-2B')] };
      return { ok: true, status: 200, json: async () => [] };
    };
    const r = await buscarAbertos(buscar, ['ruim', 'bom']);
    expect(r.modelos.map((m) => m.id)).toEqual(['bom/Novo-2B']);
    expect(r.falhas).toEqual([{ fonte: 'huggingface:ruim', motivo: 'HTTP 503' }]);
  });

  it('OpenRouter: converte o preço para US$ por milhão e ignora a variante :batch', async () => {
    const buscar: Buscar = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'lab/m', created: 1794000000, pricing: { prompt: '0.00000008', completion: '0.0000002' }, supported_parameters: ['tools'] },
          { id: 'lab/m:batch', created: 1794000000, pricing: { prompt: '0', completion: '0' } },
          { id: 'roteador/auto', created: 1794000000, pricing: { prompt: '-1', completion: '-1' }, supported_parameters: ['tools'] },
        ],
      }),
    });
    const r = await buscarHospedados(buscar);
    expect(r.modelos).toHaveLength(1);
    expect(r.modelos[0]).toMatchObject({ entradaPorMTok: 0.08, saidaPorMTok: 0.2, ferramentas: true, gratis: false });
  });

  it('OpenRouter fora do ar vira falha, não exceção', async () => {
    const r = await buscarHospedados(async () => {
      throw new Error('rede caiu');
    });
    expect(r).toEqual({ modelos: [], falhas: [{ fonte: 'openrouter', motivo: 'rede caiu' }] });
  });
});

describe('triagem', () => {
  const aberto = (id: string, parametrosB: number, extra: object = {}) => ({
    id,
    autor: id.split('/')[0],
    criadoEm: '2026-11-08',
    parametrosB,
    licenca: 'apache-2.0',
    tipo: 'text-generation',
    downloads: 10000,
    origem: 'autor' as const,
    ...extra,
  });
  const opcoes = { ...OPCOES_PADRAO, hoje: '2026-11-11' };
  const rodar = (abertos: ReturnType<typeof aberto>[], falhas = [] as { fonte: string; motivo: string }[]) =>
    triar(abertos, [], escadas, criterio, [], falhas, opcoes);

  it('modelo menor que o piso e nunca testado reabre o piso', () => {
    const t = rodar([aberto('Qwen/Qwen3.5-2B', 2.27), aberto('Qwen/Qwen3.5-0.8B', 0.87)]);
    expect(t.papeis[0].reabrePiso.map((m) => m.id)).toEqual(['Qwen/Qwen3.5-2B', 'Qwen/Qwen3.5-0.8B']);
    expect(t.achados).toBe(2);
  });

  it('modelo do tamanho do piso vai para "mesma faixa", não reabre', () => {
    const t = rodar([aberto('Qwen/Qwen3.5-4B', 4.66)]);
    expect(t.papeis[0].reabrePiso).toHaveLength(0);
    expect(t.papeis[0].mesmaFaixa.map((m) => m.id)).toEqual(['Qwen/Qwen3.5-4B']);
  });

  it('base que já está na escada não volta como novidade', () => {
    const t = rodar([aberto('Qwen/Qwen3-1.7B', 1.7)]);
    expect(t.achados).toBe(0);
  });

  it('fora da janela, grande demais ou sem tamanho não entra', () => {
    const t = rodar([
      aberto('org/Velho-2B', 2, { criadoEm: '2026-09-01' }),
      aberto('org/Enorme-70B', 70),
      aberto('org/Misterio', null as unknown as number),
    ]);
    expect(t.achados).toBe(0);
    expect(t.pequenosNovos).toHaveLength(0);
  });

  it('da lista de tendência só entra quem já tem uso', () => {
    const t = rodar([aberto('fulano/meu-ajuste-2B', 2, { origem: 'tendencia', downloads: 30 })]);
    expect(t.achados).toBe(0);
  });

  it('licença: livre, a conferir e sem uso comercial', () => {
    expect(classificarLicenca('apache-2.0')).toBe('livre');
    expect(classificarLicenca('gemma')).toBe('conferir');
    expect(classificarLicenca(null)).toBe('conferir');
    expect(classificarLicenca('cc-by-nc-4.0')).toBe('sem_uso_comercial');
  });

  it('hospedado só entra com ferramentas e mais barato que o nosso mais barato', () => {
    const h = (id: string, saida: number, ferramentas = true) => ({
      id, nome: id, criadoEm: '2026-11-09', entradaPorMTok: saida / 2, saidaPorMTok: saida, ferramentas, gratis: saida === 0,
    });
    const t = triar(
      [],
      [h('lab/gratis', 0), h('lab/barato', 0.2), h('lab/caro', 5), h('lab/sem-ferramenta', 0.1, false)],
      escadas,
      criterio,
      [{ modelo: 'local', saidaPorMTok: 0 }, { modelo: 'gpt-4o-mini', saidaPorMTok: 0.6 }],
      [],
      opcoes,
    );
    expect(t.hospedadosNovos.map((m) => m.id)).toEqual(['lab/barato', 'lab/gratis']);
    expect(t.referenciaHospedado?.modelo).toBe('gpt-4o-mini');
  });

  it('o relatório traz o piso, o achado, a contagem e a fonte que falhou', () => {
    const texto = relatorio(rodar([aberto('Qwen/Qwen3.5-2B', 2.27)], [{ fonte: 'huggingface:google', motivo: 'HTTP 503' }]));
    expect(texto).toContain('Piso provado: Qwen/Qwen3-4B');
    expect(texto).toContain('no limite');
    expect(texto).toContain('Reabrem o piso');
    expect(texto).toContain('Qwen/Qwen3.5-2B');
    expect(texto).toContain('<!-- achados: 1 -->');
    expect(texto).toContain('huggingface:google: HTTP 503');
  });
});
