// measure: o custo de provedor que a lib não fala (fal, ElevenLabs) chega ao
// coletor pelo mesmo caminho do resto. Antes ficava fora de todo relatório.
import { LLMClient } from '../client';

const enviados: any[] = [];
beforeEach(() => {
  enviados.length = 0;
  (globalThis as any).fetch = jest.fn(async (_url: string, init: any) => {
    enviados.push(JSON.parse(init.body));
    return { ok: true };
  });
});

const llm = () => new LLMClient({ product: 'CONTENTSELLER', collectorUrl: 'http://coletor', collectorApiKey: 'k' });

describe('measure', () => {
  it('devolve o resultado da chamada e reporta as unidades', async () => {
    const r = await llm().measure(
      { feature: 'criativo', provider: 'fal', model: 'ideogram/v4:balanced' },
      async () => ['img1', 'img2'],
      (imgs) => ({ units: imgs.length * 1.17 }),
    );
    expect(r).toEqual(['img1', 'img2']);
    expect(enviados).toEqual([
      expect.objectContaining({ feature: 'criativo', provider: 'fal', model: 'ideogram/v4:balanced', units: 2.34, tokensIn: 0, tokensOut: 0, success: true }),
    ]);
  });

  it('falha é reportada e o erro sobe intacto', async () => {
    const erro = new Error('fal.ai: timeout');
    await expect(
      llm().measure({ feature: 'f', provider: 'fal', model: 'm' }, async () => { throw erro; }, () => ({ units: 1 })),
    ).rejects.toBe(erro);
    expect(enviados).toEqual([expect.objectContaining({ success: false, feature: 'f' })]);
  });

  it('coletor fora do ar não derruba a chamada', async () => {
    (globalThis as any).fetch = jest.fn(async () => { throw new Error('rede'); });
    await expect(
      llm().measure({ feature: 'f', provider: 'elevenlabs', model: 'eleven_multilingual_v2' }, async () => 'audio', () => ({ units: 10 })),
    ).resolves.toBe('audio');
  });
});
