// Imagem e transcrição reportam custo ao coletor como o texto já reportava.
// Sem isso, a geração de imagem e a transcrição dos produtos ficavam fora de
// todo relatório (Kompetent e ContentSeller, até 03/10/2026).
const imagesGenerate = jest.fn();
const transcriptionsCreate = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    images: { generate: imagesGenerate },
    audio: { transcriptions: { create: transcriptionsCreate } },
  })),
);
const groqTranscriptionsCreate = jest.fn();
jest.mock('groq-sdk', () =>
  jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: groqTranscriptionsCreate } },
  })),
);

import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { LLMClient } from '../client';

const enviados: any[] = [];
beforeEach(() => {
  enviados.length = 0;
  jest.clearAllMocks();
  (globalThis as any).fetch = jest.fn(async (_url: string, init: any) => {
    enviados.push(JSON.parse(init.body));
    return { ok: true };
  });
});

const llm = () => new LLMClient({ product: 'KOMPETENT', collectorUrl: 'http://coletor', collectorApiKey: 'k' });

describe('generateImage', () => {
  it('devolve a imagem como Buffer e reporta prompt e imagem em tokens', async () => {
    imagesGenerate.mockResolvedValue({
      data: [{ b64_json: Buffer.from('png!').toString('base64') }],
      usage: { input_tokens: 40, output_tokens: 1056 },
    });

    const r = await llm().generateImage({
      provider: 'openai', apiKey: 'x', model: 'gpt-image-1-mini', prompt: 'um gato', feature: 'thumb',
    });

    expect(r.image.toString()).toBe('png!');
    expect(imagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-image-1-mini', size: '1024x1024', quality: 'medium', n: 1 }),
      expect.any(Object),
    );
    expect(enviados).toEqual([
      expect.objectContaining({ feature: 'thumb', provider: 'openai', model: 'gpt-image-1-mini', tokensIn: 40, tokensOut: 1056, success: true }),
    ]);
  });

  it('resposta sem imagem é erro, e a falha também é reportada', async () => {
    imagesGenerate.mockResolvedValue({ data: [{ url: 'https://expira-em-1h' }] });
    await expect(
      llm().generateImage({ provider: 'openai', apiKey: 'x', model: 'gpt-image-1-mini', prompt: 'p', feature: 'f' }),
    ).rejects.toThrow('não devolveu imagem');
    expect(enviados).toEqual([expect.objectContaining({ success: false, feature: 'f' })]);
  });
});

describe('transcribe', () => {
  it('Whisper: pede verbose_json e reporta a duração do áudio', async () => {
    groqTranscriptionsCreate.mockResolvedValue({ text: 'olá', duration: 42.5 });

    const r = await llm().transcribe({
      provider: 'groq', apiKey: 'x', model: 'whisper-large-v3-turbo', file: {}, language: 'pt', feature: 'stt',
    });

    expect(r).toMatchObject({ text: 'olá', audioSeconds: 42.5 });
    expect(groqTranscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: 'verbose_json', language: 'pt' }),
      expect.any(Object),
    );
    expect(enviados).toEqual([
      expect.objectContaining({ provider: 'groq', model: 'whisper-large-v3-turbo', audioSeconds: 42.5, success: true }),
    ]);
  });

  it('não força o fetch nativo: ele não sobe arquivo (falta `duplex`)', async () => {
    groqTranscriptionsCreate.mockResolvedValue({ text: '', duration: 1 });
    transcriptionsCreate.mockResolvedValue({ text: '', duration: 1 });
    await llm().transcribe({ provider: 'groq', apiKey: 'x', model: 'whisper-large-v3-turbo', file: {}, feature: 'f' });
    await llm().transcribe({ provider: 'openai', apiKey: 'x', model: 'whisper-1', file: {}, feature: 'f' });
    expect((Groq as unknown as jest.Mock).mock.calls.at(-1)[0]).not.toHaveProperty('fetch');
    expect((OpenAI as unknown as jest.Mock).mock.calls.at(-1)[0]).not.toHaveProperty('fetch');
  });

  it('modelo cobrado por token não recebe verbose_json, que ele recusa', async () => {
    transcriptionsCreate.mockResolvedValue({ text: 'oi', usage: { input_tokens: 300, output_tokens: 20 } });

    const r = await llm().transcribe({
      provider: 'openai', apiKey: 'x', model: 'gpt-4o-transcribe', file: {}, feature: 'stt',
    });

    expect(transcriptionsCreate).toHaveBeenCalledWith(expect.objectContaining({ response_format: 'json' }), expect.any(Object));
    expect(r.usage).toEqual({ inputTokens: 300, outputTokens: 20 });
    expect(enviados[0]).toMatchObject({ tokensIn: 300, tokensOut: 20, audioSeconds: 0 });
  });
});
