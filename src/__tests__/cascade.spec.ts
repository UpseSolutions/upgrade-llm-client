import { completeWithFallback } from '../fallback/cascade';
import * as completeModule from '../core/complete';
import { CompletionResult } from '../core/types';

jest.mock('../core/complete');
const mockComplete = completeModule.complete as jest.MockedFunction<typeof completeModule.complete>;

const okResult: CompletionResult = {
  text: 'resposta ok',
  usage: { inputTokens: 10, outputTokens: 5 },
  raw: {},
};

const baseParams = { messages: [{ role: 'user' as const, content: 'oi' }], maxTokens: 100, feature: 'test' };

describe('completeWithFallback', () => {
  beforeEach(() => mockComplete.mockReset());

  it('usa o primeiro provedor quando ele funciona — sem fallback', async () => {
    mockComplete.mockResolvedValueOnce(okResult);

    const result = await completeWithFallback(
      { useCase: 'test', steps: [{ provider: 'anthropic', apiKey: 'k1', model: 'claude-sonnet-5' }] },
      baseParams,
    );

    expect(result.providerUsed).toBe('anthropic');
    expect(result.fallbackTriggered).toBe(false);
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('serviço indisponível no primeiro provedor cai pro segundo (fallback real)', async () => {
    mockComplete
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' })
      .mockResolvedValueOnce(okResult);

    const result = await completeWithFallback(
      {
        useCase: 'test',
        steps: [
          { provider: 'anthropic', apiKey: 'k1', model: 'claude-sonnet-5' },
          { provider: 'openai', apiKey: 'k2', model: 'gpt-4o' },
        ],
      },
      baseParams,
    );

    expect(result.providerUsed).toBe('openai');
    expect(result.fallbackTriggered).toBe(true);
    expect(result.fallbackFromProvider).toBe('anthropic');
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it('cascata completa — todos os provedores indisponíveis lança o último erro', async () => {
    mockComplete
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' })
      .mockRejectedValueOnce({ status: 429, message: 'rate limited' })
      .mockRejectedValueOnce({ status: 503, message: 'unavailable' });

    await expect(
      completeWithFallback(
        {
          useCase: 'test',
          steps: [
            { provider: 'anthropic', apiKey: 'k1', model: 'claude-sonnet-5' },
            { provider: 'openai', apiKey: 'k2', model: 'gpt-4o' },
            { provider: 'groq', apiKey: 'k3', model: 'llama-3.3-70b-versatile' },
          ],
        },
        baseParams,
      ),
    ).rejects.toMatchObject({ status: 503, message: 'unavailable' });

    expect(mockComplete).toHaveBeenCalledTimes(3);
  });

  it('erro não-retryable (400 de validação) falha rápido, sem tentar o próximo provedor', async () => {
    mockComplete.mockRejectedValueOnce({ status: 400, message: 'invalid request' });

    await expect(
      completeWithFallback(
        {
          useCase: 'test',
          steps: [
            { provider: 'anthropic', apiKey: 'k1', model: 'claude-sonnet-5' },
            { provider: 'openai', apiKey: 'k2', model: 'gpt-4o' },
          ],
        },
        baseParams,
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('cascata de 1 elemento é um caso válido (não é tratada como exceção pelo motor)', async () => {
    mockComplete.mockResolvedValueOnce(okResult);

    const result = await completeWithFallback(
      { useCase: 'emailseller_chat', steps: [{ provider: 'anthropic', apiKey: 'k1', model: 'claude-sonnet-4-6' }] },
      baseParams,
    );

    expect(result.providerUsed).toBe('anthropic');
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('config sem nenhum step lança erro explícito', async () => {
    await expect(
      completeWithFallback({ useCase: 'vazio', steps: [] }, baseParams),
    ).rejects.toThrow('vazio');
  });
});
