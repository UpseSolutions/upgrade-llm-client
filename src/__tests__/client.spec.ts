import { LLMClient } from '../client';
import * as completeModule from '../core/complete';
import { TokenUsage, StreamCompletionResult } from '../core/types';

jest.mock('../core/complete');
const mockCompleteStream = completeModule.completeStream as jest.MockedFunction<typeof completeModule.completeStream>;
const mockComplete = completeModule.complete as jest.MockedFunction<typeof completeModule.complete>;

async function* fakeStream(
  chunks: unknown[],
  finalUsage: TokenUsage,
  raw: unknown = undefined,
): AsyncGenerator<unknown, StreamCompletionResult, void> {
  for (const chunk of chunks) yield chunk;
  return { usage: finalUsage, raw };
}

describe('LLMClient.completeStream (passthrough)', () => {
  beforeEach(() => {
    mockCompleteStream.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('repassa cada chunk nativo intacto, na mesma ordem, sem alterar os bytes', async () => {
    const nativeChunks = [{ type: 'a', n: 1 }, { type: 'b', n: 2 }, { type: 'c', n: 3 }];
    mockCompleteStream.mockReturnValue(fakeStream(nativeChunks, { inputTokens: 42, outputTokens: 17 }));

    const client = new LLMClient({ product: 'CONTENTSELLER' });
    const received: unknown[] = [];
    for await (const chunk of client.completeStream({
      provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'oi' }], maxTokens: 100, feature: 'sdr_chat',
    })) {
      received.push(chunk);
    }

    expect(received).toEqual(nativeChunks);
  });

  it('captura o usage final do stream e reporta pro coletor sem alterar o stream', async () => {
    mockCompleteStream.mockReturnValue(fakeStream([{ delta: 'x' }], { inputTokens: 100, outputTokens: 50 }));

    const client = new LLMClient({
      product: 'CONTENTSELLER',
      collectorUrl: 'https://ai-usage.upgradese.com.br',
      collectorApiKey: 'chave-teste',
    });

    const chunks = [];
    for await (const chunk of client.completeStream({
      provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'oi' }], maxTokens: 100, feature: 'sdr_chat',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({ tokensIn: 100, tokensOut: 50, streaming: true, success: true, feature: 'sdr_chat' });
  });

  it('chama onFinalMessage com a mensagem reconstruída pelo SDK ao fim do stream', async () => {
    const finalMessage = { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'x' }] };
    mockCompleteStream.mockReturnValue(fakeStream([{ delta: 'x' }], { inputTokens: 10, outputTokens: 5 }, finalMessage));

    const client = new LLMClient({ product: 'CONTENTSELLER' });
    const received: unknown[] = [];

    for await (const chunk of client.completeStream({
      provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'oi' }], maxTokens: 100, feature: 'sdr_chat',
      onFinalMessage: (raw) => received.push(raw),
    })) {
      // só consumindo o stream
    }

    expect(received).toEqual([finalMessage]);
  });

  it('erro no meio do stream ainda propaga pro consumidor e reporta success=false', async () => {
    async function* failingStream(): AsyncGenerator<unknown, StreamCompletionResult, void> {
      yield { delta: 'parcial' };
      throw new Error('conexão caiu no meio');
    }
    mockCompleteStream.mockReturnValue(failingStream());

    const client = new LLMClient({
      product: 'CONTENTSELLER',
      collectorUrl: 'https://ai-usage.upgradese.com.br',
      collectorApiKey: 'chave-teste',
    });

    const gen = client.completeStream({
      provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'oi' }], maxTokens: 100, feature: 'sdr_chat',
    });

    await expect(gen.next()).resolves.toEqual({ done: false, value: { delta: 'parcial' } });
    await expect(gen.next()).rejects.toThrow('conexão caiu no meio');

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({ success: false, streaming: true });
  });
});

describe('LLMClient.complete (não-streaming)', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('reporta tokens reais depois de uma chamada bem-sucedida', async () => {
    mockComplete.mockResolvedValueOnce({ text: 'ok', usage: { inputTokens: 30, outputTokens: 12 }, raw: {} });

    const client = new LLMClient({
      product: 'AGENTEUP',
      collectorUrl: 'https://ai-usage.upgradese.com.br',
      collectorApiKey: 'chave-teste',
    });

    const result = await client.complete({
      provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'oi' }], maxTokens: 100, feature: 'chat',
    });

    expect(result.text).toBe('ok');
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({ tokensIn: 30, tokensOut: 12, success: true, streaming: false });
  });
});
