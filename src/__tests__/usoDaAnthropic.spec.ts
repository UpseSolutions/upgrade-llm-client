import { usoDaAnthropic } from '../core/adapters/anthropic';
import { usageFromTokenUsage } from '../usage/reporter';

describe('usoDaAnthropic', () => {
  it('sem cache: igual à API', () => {
    expect(usoDaAnthropic({ input_tokens: 1200, output_tokens: 50 } as any)).toEqual({ inputTokens: 1200, cachedTokens: undefined });
  });

  it('gravação separada por duração — o exemplo de uso da documentação da Anthropic', () => {
    // Formato real (prompt caching): cache_creation_input_tokens = soma do objeto cache_creation.
    const u = usoDaAnthropic({
      input_tokens: 2048, cache_read_input_tokens: 1800, cache_creation_input_tokens: 248, output_tokens: 503,
      cache_creation: { ephemeral_5m_input_tokens: 148, ephemeral_1h_input_tokens: 100 },
    } as any);
    expect(u).toEqual({ inputTokens: 2048, cachedTokens: 1800, cacheWriteTokens: 248, cacheWrite5mTokens: 148, cacheWrite1hTokens: 100 });
  });

  it('gravação NÃO entra mais na entrada (o coletor cobra 1,25× / 2× à parte)', () => {
    const u = usoDaAnthropic({ input_tokens: 2, output_tokens: 70, cache_creation_input_tokens: 54_791, cache_read_input_tokens: 0 } as any);
    expect(u.inputTokens).toBe(2);
    expect(u.cacheWriteTokens).toBe(54_791);
    expect(u.cacheWrite5mTokens).toBe(54_791);   // sem detalhe por duração: conta como 5 min
    expect(u.cacheWrite1hTokens).toBeUndefined();
  });

  it('leitura do cache continua separada, cobrada à parte', () => {
    const u = usoDaAnthropic({ input_tokens: 2, output_tokens: 70, cache_read_input_tokens: 54_791 } as any);
    expect(u.inputTokens).toBe(2);
    expect(u.cachedTokens).toBe(54_791);
    expect(u.cacheWriteTokens).toBeUndefined();
  });
});

describe('usageFromTokenUsage (o que vai ao coletor)', () => {
  it('manda a gravação por duração nos campos do coletor', () => {
    expect(usageFromTokenUsage({ inputTokens: 2048, outputTokens: 503, cachedTokens: 1800, cacheWriteTokens: 248, cacheWrite5mTokens: 148, cacheWrite1hTokens: 100 }))
      .toEqual({ tokensIn: 2048, tokensOut: 503, tokensCached: 1800, tokensCacheWrite5m: 148, tokensCacheWrite1h: 100 });
  });
  it('sem gravação, não manda os campos (evento igual ao de antes)', () => {
    expect(usageFromTokenUsage({ inputTokens: 10, outputTokens: 5 })).toEqual({ tokensIn: 10, tokensOut: 5, tokensCached: undefined });
  });
});
