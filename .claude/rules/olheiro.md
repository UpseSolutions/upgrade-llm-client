---
paths:
  - "src/olheiro/**"
  - ".github/workflows/olheiro.yml"
  - "src/__tests__/olheiro.spec.ts"
---

# Olheiro de modelos e piso de cada papel

Porquê e histórico: `docs/decisoes/historico.md`. Guardião: `olheiro.spec.ts`.

- Lê Hugging Face (autores em `fontes.ts`, `AUTORES`) e OpenRouter **sem chave e sem modelo de linguagem**, e
  cruza com `escadas.json`. O workflow abre issue só com achado ou fonte com falha.
- O degrau passa pela **pior prova** (barra em `escadas.json`, `criterio`). Duas rodadas abaixo da barra sem a
  pior prova subir = `no_limite`. Piso `provado` quando o degrau de baixo está `no_limite`; senão `provisorio`.
- **Toda rodada medida entra em `escadas.json`, passando ou não.** O negativo é o que prova o piso.
  Modelo já listado ali não volta como novidade.
- Piso provado vale para os modelos que existiam na medição; modelo novo e menor "reabre o piso". Próximo passo:
  medir só com prompt nas provas congeladas, antes de treinar.
- `escadas.json` fica fora do `models.json` de propósito (nenhum produto depende dele, não pede edição no coletor).
- Fonte que falha vai para `falhas` no relatório, nunca some.
- Nesta máquina: `node --use-system-ca` (`SELF_SIGNED_CERT_IN_CHAIN` do OpenRouter).
