import { LLMClient } from '../client';
import * as completeModule from '../core/complete';
import {
  LIMITE_POR_HORA_PADRAO,
  PAUSA_SEM_CREDITO_MS,
  configurarReservaAnthropic,
  fetchComReservaAnthropic,
  semCredito,
} from '../core/reserva';
import { CompleteParams, StreamCompletionResult } from '../core/types';

jest.mock('../core/complete');
const mockComplete = completeModule.complete as jest.MockedFunction<typeof completeModule.complete>;
const mockCompleteStream = completeModule.completeStream as jest.MockedFunction<typeof completeModule.completeStream>;

// Mensagem real da Anthropic em 18/10/2026 (chave principal sem crédito, HTTP 400).
const SEM_CREDITO = Object.assign(
  new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'),
  { status: 400 },
);

const base: CompleteParams = {
  provider: 'anthropic', apiKey: 'principal', model: 'm', messages: [], maxTokens: 5, feature: 'teste',
};
const ok = { text: 'ok', usage: { inputTokens: 1, outputTokens: 1 }, raw: {} };

describe('reserva da Anthropic', () => {
  let chaves: string[];
  const cliente = () => new LLMClient({ product: 'AGENTEUP' });

  function falhaCom(err: Error, chave = 'principal') {
    mockComplete.mockImplementation(async (p) => {
      chaves.push(p.apiKey);
      if (p.apiKey === chave) throw err;
      return ok as never;
    });
  }

  beforeEach(() => {
    chaves = [];
    mockComplete.mockReset();
    mockCompleteStream.mockReset();
    configurarReservaAnthropic({ principal: 'principal', reserva: 'reserva', aviso: () => {} });
  });
  afterEach(() => {
    jest.useRealTimers();
    configurarReservaAnthropic(null);
  });

  it('com crédito, só a principal é usada', async () => {
    falhaCom(new Error('nunca'), 'outra');
    await cliente().complete(base);
    expect(chaves).toEqual(['principal']);
  });

  it('sem crédito, repete com a reserva e as próximas vão direto nela, em qualquer cliente', async () => {
    falhaCom(SEM_CREDITO);
    await expect(cliente().complete(base)).resolves.toMatchObject({ text: 'ok' });
    await cliente().complete(base);
    expect(chaves).toEqual(['principal', 'reserva', 'reserva']);
  });

  it('passada a pausa, volta a tentar a principal', async () => {
    jest.useFakeTimers({ now: 0 });
    falhaCom(SEM_CREDITO);
    await cliente().complete(base);
    jest.setSystemTime(PAUSA_SEM_CREDITO_MS + 1);
    falhaCom(new Error('nunca'), 'outra');
    await cliente().complete(base);
    expect(chaves).toEqual(['principal', 'reserva', 'principal']);
  });

  it('outro erro não gasta a reserva', async () => {
    falhaCom(Object.assign(new Error('401 invalid x-api-key'), { status: 401 }));
    await expect(cliente().complete(base)).rejects.toThrow('invalid x-api-key');
    expect(chaves).toEqual(['principal']);
  });

  it('chave própria do cliente sem crédito não cai na reserva nem pausa a principal', async () => {
    falhaCom(SEM_CREDITO, 'do-cliente');
    await expect(cliente().complete({ ...base, apiKey: 'do-cliente' })).rejects.toThrow('credit balance');
    await cliente().complete(base);
    expect(chaves).toEqual(['do-cliente', 'principal']);
  });

  it('sem reserva configurada, o erro sobe como antes', async () => {
    configurarReservaAnthropic({ principal: 'principal', reserva: undefined });
    falhaCom(SEM_CREDITO);
    await expect(cliente().complete(base)).rejects.toThrow('credit balance');
    expect(chaves).toEqual(['principal']);
  });

  it('outro provedor não usa a reserva', async () => {
    falhaCom(SEM_CREDITO);
    await expect(cliente().complete({ ...base, provider: 'groq' })).rejects.toThrow('credit balance');
    expect(chaves).toEqual(['principal']);
  });

  it('as duas sem crédito: pausa, nem chama, e o erro continua dizendo credit balance', async () => {
    jest.useFakeTimers({ now: 0 });
    mockComplete.mockImplementation(async (p) => { chaves.push(p.apiKey); throw SEM_CREDITO; });
    await expect(cliente().complete(base)).rejects.toThrow('credit balance');
    for (let i = 0; i < 5; i++) await expect(cliente().complete(base)).rejects.toThrow('credit balance');
    expect(chaves).toEqual(['principal', 'reserva']);
    jest.setSystemTime(PAUSA_SEM_CREDITO_MS + 1);
    await expect(cliente().complete(base)).rejects.toThrow('credit balance');
    expect(chaves).toEqual(['principal', 'reserva', 'principal', 'reserva']);
  });

  it('freio de gasto: passou do limite por hora na reserva, recusa sem chamar', async () => {
    jest.useFakeTimers({ now: 0 });
    falhaCom(SEM_CREDITO);
    for (let i = 0; i < LIMITE_POR_HORA_PADRAO; i++) await cliente().complete(base);
    const antes = chaves.length;
    await expect(cliente().complete(base)).rejects.toThrow('por hora');
    expect(chaves).toHaveLength(antes);
    await expect(cliente().complete({ ...base, feature: 'outra' })).resolves.toMatchObject({ text: 'ok' });
    jest.setSystemTime(3600_000 + 1);
    falhaCom(new Error('nunca'), 'outra');
    await expect(cliente().complete(base)).resolves.toMatchObject({ text: 'ok' });
  });

  it('o limite por feature substitui o padrão e a principal com crédito não conta', async () => {
    configurarReservaAnthropic({ principal: 'principal', reserva: 'reserva', limitePorHora: { teste: 1 }, aviso: () => {} });
    falhaCom(new Error('nunca'), 'outra');
    for (let i = 0; i < 5; i++) await cliente().complete(base);
    falhaCom(SEM_CREDITO);
    await cliente().complete(base);
    await expect(cliente().complete(base)).rejects.toThrow('por hora');
  });

  it('stream: a recusa antes do primeiro pedaço repete na reserva, sem o chamador ver erro', async () => {
    async function* fake(p: CompleteParams): AsyncGenerator<unknown, StreamCompletionResult, void> {
      chaves.push(p.apiKey);
      if (p.apiKey === 'principal') throw SEM_CREDITO;
      yield 'a';
      yield 'b';
      return { usage: { inputTokens: 1, outputTokens: 1 }, raw: undefined };
    }
    mockCompleteStream.mockImplementation(fake as never);
    const recebidos: unknown[] = [];
    for await (const pedaco of cliente().completeStream(base)) recebidos.push(pedaco);
    expect(recebidos).toEqual(['a', 'b']);
    expect(chaves).toEqual(['principal', 'reserva']);
  });

  it('stream: erro no meio não repete, para não mandar a resposta duas vezes', async () => {
    async function* fake(p: CompleteParams): AsyncGenerator<unknown, StreamCompletionResult, void> {
      chaves.push(p.apiKey);
      yield 'a';
      throw SEM_CREDITO;
    }
    mockCompleteStream.mockImplementation(fake as never);
    const recebidos: unknown[] = [];
    await expect((async () => {
      for await (const pedaco of cliente().completeStream(base)) recebidos.push(pedaco);
    })()).rejects.toThrow('credit balance');
    expect(recebidos).toEqual(['a']);
    expect(chaves).toEqual(['principal']);
  });

  it('cascata: tenta a reserva antes do passo seguinte e só desce com as duas sem crédito', async () => {
    const steps = [
      { provider: 'anthropic' as const, apiKey: 'principal', model: 'm' },
      { provider: 'groq' as const, apiKey: 'g', model: 'x' },
    ];
    const params = { messages: [], maxTokens: 5, feature: 'teste' };
    falhaCom(SEM_CREDITO);
    await expect(cliente().completeWithFallback({ useCase: 'u', steps }, params)).resolves.toMatchObject({ providerUsed: 'anthropic' });
    expect(chaves).toEqual(['principal', 'reserva']);

    configurarReservaAnthropic({ principal: 'principal', reserva: 'reserva', aviso: () => {} });
    chaves = [];
    mockComplete.mockImplementation(async (p) => {
      chaves.push(p.apiKey);
      if (p.provider === 'anthropic') throw SEM_CREDITO;
      return ok as never;
    });
    await expect(cliente().completeWithFallback({ useCase: 'u', steps }, params)).resolves.toMatchObject({ providerUsed: 'groq' });
    expect(chaves).toEqual(['principal', 'reserva', 'g']);
  });

  it('semCredito reconhece só a recusa por saldo', () => {
    expect(semCredito(SEM_CREDITO)).toBe(true);
    expect(semCredito(new Error('overloaded'))).toBe(false);
  });
});

describe('fetchComReservaAnthropic', () => {
  const CORPO = JSON.stringify({ type: 'error', error: { message: 'Your credit balance is too low to access the Anthropic API.' } });
  const original = global.fetch;
  let chaves: (string | null)[];

  function respostaPara(semSaldo: string[]) {
    global.fetch = jest.fn(async (_url, init) => {
      const chave = new Headers(init?.headers).get('x-api-key');
      chaves.push(chave);
      return semSaldo.includes(chave!) ? new Response(CORPO, { status: 400 }) : new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
  }
  const chamar = (chave = 'principal') =>
    fetchComReservaAnthropic('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': chave } });

  beforeEach(() => {
    chaves = [];
    configurarReservaAnthropic({ principal: 'principal', reserva: 'reserva', aviso: () => {} });
  });
  afterEach(() => {
    global.fetch = original;
    configurarReservaAnthropic(null);
  });

  it('sem crédito, repete com a reserva e as próximas vão direto nela', async () => {
    respostaPara(['principal']);
    expect((await chamar()).status).toBe(200);
    await chamar();
    expect(chaves).toEqual(['principal', 'reserva', 'reserva']);
  });

  it('outro 400 volta como está, sem gastar a reserva', async () => {
    global.fetch = jest.fn(async () => {
      chaves.push('x');
      return new Response('{"error":{"message":"max_tokens inválido"}}', { status: 400 });
    }) as typeof fetch;
    expect((await chamar()).status).toBe(400);
    expect(chaves).toEqual(['x']);
  });

  it('chave de cliente não cai na reserva', async () => {
    respostaPara(['do-cliente']);
    expect((await chamar('do-cliente')).status).toBe(400);
    expect(chaves).toEqual(['do-cliente']);
  });

  it('as duas sem crédito: a recusa chega como 400, que o SDK não repete', async () => {
    respostaPara(['principal', 'reserva']);
    expect((await chamar()).status).toBe(400);
    const pausada = await chamar();
    expect(pausada.status).toBe(400);
    expect(await pausada.text()).toContain('credit balance');
    expect(chaves).toEqual(['principal', 'reserva']);
  });

  it('falha de rede sobe como falha de rede', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await expect(chamar()).rejects.toThrow('fetch failed');
  });
});
