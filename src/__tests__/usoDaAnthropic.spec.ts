import { usoDaAnthropic } from '../core/adapters/anthropic';

describe('usoDaAnthropic', () => {
  it('sem cache: igual à API', () => {
    expect(usoDaAnthropic({ input_tokens: 1200, output_tokens: 50 } as any)).toEqual({ inputTokens: 1200, cachedTokens: undefined });
  });

  it('gravação no cache entra na conta de entrada — antes sumia do coletor', () => {
    const u = usoDaAnthropic({ input_tokens: 2, output_tokens: 70, cache_creation_input_tokens: 54_791, cache_read_input_tokens: 0 } as any);
    expect(u.inputTokens).toBe(54_793);
    expect(u.cacheWriteTokens).toBe(54_791);
    expect(u.cachedTokens).toBe(0);
  });

  it('leitura do cache continua separada, cobrada à parte', () => {
    const u = usoDaAnthropic({ input_tokens: 2, output_tokens: 70, cache_read_input_tokens: 54_791 } as any);
    expect(u.inputTokens).toBe(2);
    expect(u.cachedTokens).toBe(54_791);
    expect(u.cacheWriteTokens).toBeUndefined();
  });
});
