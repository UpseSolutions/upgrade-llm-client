---
paths:
  - "src/client.ts"
  - "src/core/**"
  - "src/fallback/**"
  - "src/usage/**"
  - "src/__tests__/{cascade,isRetryable,reserva,reporter,usoDaAnthropic,client,media,signal,measure}.spec.ts"
---

# Cliente, cascata, reserva e reporte

Porquê e histórico: `docs/decisoes/historico.md`.

## Regras

- **Nunca ler env var aqui.** Chave, URL e opções entram por parâmetro.
- **Não traduzir formato entre provedores.** `tools` e blocos (tool_use, imagem) são `unknown[]` e vão como o
  provedor nativo espera.
- **Cascata é para indisponibilidade.** 429, 503, overloaded e timeout tentam o próximo passo; 400 de validação
  e 401 propagam na hora. Guardiões: `cascade.spec.ts`, `isRetryable.spec.ts`.
- **O reporter nunca lança** (fire-and-forget de verdade). Guardião: `reporter.spec.ts`. Nunca mandar prompt ou
  resposta ao coletor: só tokens, custo, latência e sucesso.
- Campo novo de uso só começa a ser enviado **depois** de ir ao ar no coletor (o zod de lá descarta campo
  desconhecido em silêncio).

## Reserva da Anthropic (`src/core/reserva.ts`)

- O produto liga uma vez por processo (API e worker): `configurarReservaAnthropic({ principal, reserva })`.
  Vale para `complete`, `completeStream` e `completeWithFallback`.
- **Só `credit balance` aciona a reserva.** Chave própria de cliente nunca cai nela.
- As duas sem crédito: pausa de 15 min, e o erro **mantém "credit balance"** (é o que aciona o Groq nos produtos).
- Freio só na reserva: 60 chamadas por hora por feature, salvo `limitePorHora`.
- SDK da Anthropic direto: `fetch: fetchComReservaAnthropic` no construtor (vale para `messages.stream`).
- Guardião: `reserva.spec.ts`. Mexer aqui é tarefa crítica.

## Uso da Anthropic

- Gravação no cache de prompt vai separada (5 min / 1 h) e **não** entra em `tokensIn` (o coletor cobra
  1,25× / 2× à parte). Guardião: `usoDaAnthropic.spec.ts`.
