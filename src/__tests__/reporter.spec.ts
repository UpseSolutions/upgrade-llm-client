import { reportUsage } from '../usage/reporter';

describe('reportUsage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('não faz nenhuma chamada quando não há collectorApiKey (no-op)', () => {
    reportUsage(undefined, { feature: 'x', provider: 'anthropic', model: 'claude-sonnet-5', tokensIn: 1, tokensOut: 1, success: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('dispara POST pro coletor com o payload correto quando configurado', () => {
    reportUsage(
      { product: 'AGENTEUP', collectorUrl: 'https://ai-usage.upgradese.com.br', collectorApiKey: 'chave-teste' },
      { feature: 'chat', provider: 'openai', model: 'gpt-4o-mini', tokensIn: 10, tokensOut: 5, success: true },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ai-usage.upgradese.com.br/usage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'chave-teste' },
      }),
    );
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ feature: 'chat', provider: 'openai', tokensIn: 10, tokensOut: 5, success: true });
  });

  it('nunca lança mesmo se o fetch falhar (fire-and-forget de verdade)', () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('rede fora do ar'));

    expect(() =>
      reportUsage(
        { product: 'HADRIANS', collectorUrl: 'https://ai-usage.upgradese.com.br', collectorApiKey: 'chave-teste' },
        { feature: 'chat', provider: 'anthropic', model: 'claude-sonnet-5', tokensIn: 1, tokensOut: 1, success: true },
      ),
    ).not.toThrow();
  });
});
