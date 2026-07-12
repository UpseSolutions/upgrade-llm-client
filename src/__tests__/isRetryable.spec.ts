import { isRetryable } from '../fallback/isRetryable';

describe('isRetryable', () => {
  it('trata 429 como retryable', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it('trata 503 como retryable', () => {
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it('trata mensagem "overloaded" como retryable', () => {
    expect(isRetryable({ message: 'Anthropic API overloaded, try again' })).toBe(true);
  });

  it('trata timeout de rede como retryable', () => {
    expect(isRetryable({ message: 'connect ETIMEDOUT' })).toBe(true);
  });

  it('trata 400 de validação como NÃO retryable', () => {
    expect(isRetryable({ status: 400, message: 'invalid request: max_tokens too large' })).toBe(false);
  });

  it('trata 401 de auth como NÃO retryable', () => {
    expect(isRetryable({ status: 401, message: 'invalid api key' })).toBe(false);
  });

  it('erro sem status nem mensagem reconhecida não é retryable', () => {
    expect(isRetryable(new Error('algo genérico'))).toBe(false);
  });
});
