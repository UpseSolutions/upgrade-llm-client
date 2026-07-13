// AbortSignal precisa chegar até o SDK do provedor — sem isso, um caller
// que hoje usa AbortController com timeout próprio (padrão comum antes de
// existir a lib, ver migração do AgenteUP/Claude) perderia esse
// comportamento silenciosamente ao trocar pra lib.
const anthropicCreateMock = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'ok' }],
  usage: { input_tokens: 1, output_tokens: 1 },
});
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: anthropicCreateMock },
  }));
});

const openaiCreateMock = jest.fn().mockResolvedValue({
  choices: [{ message: { content: 'ok' } }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
});
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: openaiCreateMock } },
  }));
});

import { complete } from '../core/complete';

describe('AbortSignal passthrough pro SDK do provedor', () => {
  beforeEach(() => {
    anthropicCreateMock.mockClear();
    openaiCreateMock.mockClear();
  });

  it('repassa o signal pro client.messages.create da Anthropic', async () => {
    const controller = new AbortController();
    await complete({
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'oi' }],
      maxTokens: 100,
      feature: 'test',
      signal: controller.signal,
    });

    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('repassa o signal pro client.chat.completions.create da OpenAI', async () => {
    const controller = new AbortController();
    await complete({
      provider: 'openai',
      apiKey: 'k',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'oi' }],
      maxTokens: 100,
      feature: 'test',
      signal: controller.signal,
    });

    expect(openaiCreateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
