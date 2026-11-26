---
paths:
  - "src/vigia/**"
  - "src/__tests__/vigia.spec.ts"
---

# Vigia das plataformas

Porquê e histórico: `docs/decisoes/historico.md`. Guardião: `vigia.spec.ts`.

- 🔴 **Repositório público.** O inventário real fica só na máquina vigiada (`VIGIA_ALVOS`, padrão
  `/etc/vigia/alvos.json`). Aqui vai só `alvos.exemplo.json`, com nomes **fictícios**; `src/vigia/alvos.json`
  está no `.gitignore`. Nada de nome de produto, domínio, banco ou retrato do que está quebrado em código,
  comentário, teste, commit ou PR.
- Exemplo de log passa por `semSegredo` antes de ir para o relatório ou para a IA.
- Roda por cron na máquina vigiada, não no GitHub Actions (precisa ver containers, logs e backups).
- `coleta.ts` é a única parte com máquina. `regras.ts` é puro (fatos → achados com gravidade e ação), com teste
  por regra. `comparar` marca novo / persistente / resolvido.
- `resumo.ts` escreve 6 linhas pela cascata do papel `classificacao`. **A IA só escreve**: gravidade, ação e
  números vêm das regras. Sem chave ou sem crédito, o relatório sai sem resumo; nunca deixa de avisar por causa da IA.
