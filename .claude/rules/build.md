---
paths:
  - "dist/**"
  - "registro/**"
  - "package.json"
  - "tsconfig.json"
  - "src/index.ts"
  - "src/registro.ts"
  - "src/__tests__/registro-sem-sdk.spec.ts"
---

# Build, dist/ e pontos de entrada

Porquê e histórico: `docs/decisoes/historico.md`.

## dist/ versionado

- Os produtos instalam do GitHub e recebem o `dist/` commitado. Mexeu em `src/`: `npm run build` e commitar o
  `dist/` no mesmo PR.
- **Build incremental morde:** apagar `dist/` e rodar `npm run build` emite quase nada se o `*.tsbuildinfo`
  ficar. Apagar os dois juntos.
- `models.json` é emitido para `dist/models/` (`resolveJsonModule`); os produtos Python leem esse arquivo direto.
  Por isso o registro é JSON, não TS.

## Dois pontos de entrada

- `@upgrade/llm-client` (raiz, carrega os SDKs) e `@upgrade/llm-client/registro` (só lê o registro, carrega
  **zero** módulo de SDK). Guardião: `src/__tests__/registro-sem-sdk.spec.ts`, que mede o grafo num processo
  separado e usa a raiz como contraprova.
- Declarar `exports` **fecha** o pacote: subcaminho não declarado deixa de resolver. A entrada `"."` não sai.
- `main`/`types` continuam no `package.json`, e o diretório-stub `registro/package.json` aponta para
  `../dist/registro.js`: `moduleResolution: node` ignora `exports`, e os consumidores estão em configurações
  diferentes.
- O subcaminho evita **carregar** os SDKs, não **instalar**. Passar para `peerDependencies` muda os quatro
  produtos: mudança maior, não feita.
- Mexer em `exports` é tarefa crítica.
