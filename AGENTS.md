# @upgrade/llm-client

Wrapper fino sobre Anthropic/OpenAI/Groq (e provedores compatíveis com a OpenAI) com cascata de fallback,
registro de modelos por papel e reporte de uso para o coletor central (`ai-usage-collector`).

Consumido por agenteup, contentseller, alfabetia e goldanalyzer via
`"@upgrade/llm-client": "github:UpseSolutions/upgrade-llm-client#main"`.

O porquê de cada decisão: `docs/decisoes/historico.md` (o CLAUDE.md antigo, inteiro).

## Comandos

- Instalar: `npm ci`
- Testes: `npm test` (um arquivo: `npx jest src/__tests__/registry.spec.ts`). O `registro-sem-sdk.spec`
  lê o `dist/`: rode `npm run build` antes.
- Tipos: `npm run typecheck`
- Build: `npm run build`. Build limpo: apagar `dist/` **e** `*.tsbuildinfo` juntos.
- Olheiro: `npm run olheiro`. Nesta máquina: `node --use-system-ca dist/olheiro/cli.js --dias 8`
  (o Node recusa o certificado do OpenRouter aqui; no GitHub Actions não acontece).

## Arquitetura

- `src/client.ts`, `src/core/`: `LLMClient`, `complete`/`completeStream`, adapters (Anthropic e
  OpenAI-compatível), mídia, reserva da Anthropic.
- `src/fallback/`: cascata (`completeWithFallback`) e `isRetryable`.
- `src/models/`: `models.json` (o registro: papéis, modelos, provedores, preços, overrides),
  `registry.ts` (`resolveRole`, `passosDoPapel`, `requiredEnvKeys`), `carregar.ts` (registro do coletor no boot).
- `src/registro.ts` + `registro/package.json`: subcaminho `@upgrade/llm-client/registro`, sem SDK.
- `src/usage/reporter.ts`: reporte de uso ao coletor (fire-and-forget, nunca lança).
- `src/olheiro/`: modelos novos × piso de cada papel (`escadas.json`). Roda no `olheiro.yml`.
- `src/vigia/`: "o que está quebrado e ninguém viu?", roda por cron na máquina vigiada.

## Regras de código

- Dizer as suposições antes de codar. Pedido ambíguo: perguntar.
- Código mínimo que resolve o pedido. Sem abstração de uso único, sem opção não pedida.
- Mudança cirúrgica: cada linha alterada vem do pedido. Seguir o estilo existente.
- Bug: primeiro o teste que reproduz. Função nova: testes antes. Refatoração: testes antes e depois.
- Só dizer "pronto" depois de rodar os testes.

## Ciclo

- Tarefa pequena: teste → correção → testes.
- Tarefa média: plano curto aprovado antes de editar.
- Tarefa grande: plano em `docs/planos/AAAA-MM-DD-nome.md` (pasta fora do git: o repositório é público),
  aprovado, executado por etapas com revisão.
- Tarefa crítica (reserva da Anthropic, `exports` do pacote, formato do registro que o coletor publica,
  qualquer coisa que mexa em chave): ciclo grande + revisão de segurança.

## Regras do projeto

Detalhe por assunto em `.claude/rules/` (entra sozinho quando a tarefa mexe naqueles arquivos):
`build.md`, `cliente.md`, `registro.md`, `olheiro.md`, `vigia.md`.

- **`dist/` é versionado.** Quem instala do GitHub recebe o build pronto. Mexeu em `src/`: `npm run build`
  e commitar o `dist/` junto, senão os produtos seguem na versão anterior.
- **A lib nunca lê env var.** Tudo entra por parâmetro (`passosDoPapel(papel, produto, process.env)`: quem
  chama passa o env). Só os CLIs leem `process.env` (hoje, `src/vigia/cli.ts`).
- **A lib não traduz formato entre provedores.** `tools` e blocos de conteúdo vão no formato nativo (`unknown[]`).
- **Cascata é para indisponibilidade, não para mascarar bug.** Erro não-retryable propaga na hora.
- **Coletor fora do ar nunca impede um produto de atender cliente.** `carregarRegistro` nunca lança e cai na
  cópia compilada.
- 🔴 **Ordem de deploy:** papel ou provedor novo vai ao ar **no coletor antes** de a lib nova chegar aos
  produtos (a lib recusa uma edição do coletor sem um papel que ela conhece e cai na cópia compilada).
- `vanguardai/config/models.yaml` é outro registro (tiers do Router do VI), não duplicata. Ler antes de mexer em
  Kimi/Moonshot.

## Repositório público

- Nada de inventário real (domínio, banco, caminho, nome de cliente, retrato do que está quebrado) em código,
  comentário, teste, commit ou PR. O inventário do vigia fica só na máquina.
- Planos (`docs/planos/`) ficam fora do git.

## Nunca

- Ler ou editar `.env` e arquivos de segredo.
- Fazer deploy ou mexer em produção fora da esteira de CI, sem pedido do dono.
