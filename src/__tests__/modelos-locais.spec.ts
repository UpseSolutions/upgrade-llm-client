import { resolveRole, passosDoPapel, modelCatalog, requiredEnvKeys } from '../models/registry';

const mockCreate = jest.fn();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { completeOpenAICompatible } = require('../core/adapters/openaiCompatible');

/**
 * Modelos locais: o provedor `local` (Ollama na VPS) e o escalonador por papel.
 *
 * O que estes testes protegem:
 * - o `reasoning_effort: "none"` chegar no pedido. Sem ele, o Qwen3 pelo Ollama
 *   pensa sozinho: 11-16 s numa frase de oi, e a resposta pode vir vazia no teto
 *   de tokens (medido em 10/11/2026);
 * - um produto sem `MODELOS_LOCAIS_KEY` nunca tentar o local (o contêiner dele não
 *   enxerga o serviço, e cada tentativa seria uma falha a mais antes da reserva).
 */
describe('provedor local', () => {
  beforeEach(() => mockCreate.mockReset());

  it('o passo local vem com a URL do serviço e o corpo extra do registro', () => {
    const local = resolveRole('atendimento_agenda').find((p) => p.provider === 'local');
    expect(local).toEqual({
      model: 'agente-qwen3-4b-v3',
      provider: 'local',
      providerSpec: {
        api: 'openai-compatible',
        baseUrl: 'http://modelos-locais:11434/v1',
        extraBody: { reasoning_effort: 'none' },
      },
    });
  });

  it('o adaptador manda o corpo extra junto do pedido, sem deixar ele trocar o modelo', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'oi' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } });
    await completeOpenAICompatible(
      { api: 'openai-compatible', baseUrl: 'http://x/v1', extraBody: { reasoning_effort: 'none', model: 'intruso' } },
      { provider: 'local', apiKey: 'local', model: 'agente-qwen3-4b-v3', messages: [{ role: 'user', content: 'oi' }], maxTokens: 10, feature: 't' },
    );
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ reasoning_effort: 'none', model: 'agente-qwen3-4b-v3', max_tokens: 10 });
  });

  it('provedor sem corpo extra não muda o pedido (OpenAI, Groq e cia. seguem iguais)', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'oi' } }] });
    await completeOpenAICompatible(
      { api: 'openai-compatible' },
      { provider: 'openai', apiKey: 'k', model: 'gpt-4o', messages: [{ role: 'user', content: 'oi' }], maxTokens: 10, feature: 't' },
    );
    expect(Object.keys(mockCreate.mock.calls[0][0]).sort()).toEqual(['max_tokens', 'messages', 'model', 'temperature', 'tools']);
  });
});

describe('passosDoPapel', () => {
  const TODAS = { OPENAI_API_KEY: 'o', ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'g', MODELOS_LOCAIS_KEY: 'local' };

  it('com todas as chaves, devolve a cascata inteira na ordem do registro', () => {
    expect(passosDoPapel('atendimento_agenda', undefined, TODAS).map((p) => p.model))
      .toEqual(['gpt-4o', 'claude-sonnet-5', 'agente-qwen3-4b-v3', 'qwen/qwen3.8-27b']);
  });

  it('sem MODELOS_LOCAIS_KEY, o passo local fica de fora (o produto não enxerga o serviço)', () => {
    const { MODELOS_LOCAIS_KEY, ...semLocal } = TODAS;
    void MODELOS_LOCAIS_KEY;
    expect(passosDoPapel('atendimento_agenda', undefined, semLocal).map((p) => p.provider)).not.toContain('local');
  });

  it('cada passo leva a chave do SEU provedor', () => {
    const passos = passosDoPapel('atendimento_agenda', undefined, TODAS);
    expect(passos.map((p) => [p.provider, p.apiKey])).toEqual([['openai', 'o'], ['anthropic', 'a'], ['local', 'local'], ['groq', 'g']]);
  });

  it('nenhuma chave: levanta dizendo quais faltam, em vez de devolver cascata vazia', () => {
    expect(() => passosDoPapel('atendimento_agenda', undefined, {})).toThrow(/OPENAI_API_KEY.*MODELOS_LOCAIS_KEY/);
  });

  it('requiredEnvKeys passa a citar a chave do local', () => {
    expect(requiredEnvKeys('atendimento_agenda')).toContain('MODELOS_LOCAIS_KEY');
  });
});

describe('boletim', () => {
  it('todo modelo local numa cascata tem boletim naquele papel (regra: só sobe com prova)', () => {
    const catalogo = modelCatalog();
    for (const entrada of catalogo.filter((m) => m.provider === 'local')) {
      expect(entrada.boletim?.length).toBeGreaterThan(0);
      for (const linha of entrada.boletim!) {
        expect(linha.nota).toBeGreaterThanOrEqual(0);
        expect(linha.nota).toBeLessThanOrEqual(1);
        expect(() => resolveRole(linha.papel as never)).not.toThrow();
      }
    }
  });
});
