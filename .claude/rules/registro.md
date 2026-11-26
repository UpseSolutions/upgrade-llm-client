---
paths:
  - "src/models/**"
  - "src/registro.ts"
  - "src/__tests__/{registry,carregar,modelos-locais}.spec.ts"
---

# Registro de modelos (`src/models/models.json`)

Porquê e histórico (varredura de 08/09/2026, casos emailseller e gemini-2.0-flash): `docs/decisoes/historico.md`.
Guardiões: `registry.spec.ts`, `carregar.spec.ts`, `modelos-locais.spec.ts`.

## O que é dado

- Produtos pedem **papel**, não modelo (`conversa`, `redacao`, `raciocinio`, `classificacao`, `visao`,
  `embedding`, `transcricao`, `imagem`, `atendimento_agenda`...). Trocar modelo é editar uma linha.
- O registro diz QUAL modelo e QUAL provedor, **nunca com que credencial** (`envKey` é o nome da variável).
- Provedor é dado: `providers` traz `api`, `baseUrl`, `envKey`, `verified` e `extraBody`.
- `anthropic`, `openai` e `groq` funcionam sem `providerSpec`. Provedor fora dos três **exige** spec e falha na
  hora, com o nome. O Groq fica no `groq-sdk` (é o que roda nos produtos).

## Travas de propósito

- **`verified: false`** (deepseek, moonshot, together, fireworks, openrouter): baseUrl escrita de memória;
  **nenhum papel aponta para eles** até alguém conferir na doc do provedor e virar a flag.
- **`measuredEngine`**: modelo que é o OBJETO de uma medição (ex.: `gemini-2.0-flash` no hadrians). Fica no
  catálogo (tem preço) e `resolveRole` recusa usá-lo. Nunca "atualizar" para um mais novo.
- **Override de produto exige `reason`.** Sem razão que se escreva, usar o default.
- **Embedding tem cascata de um elemento só.** Trocar o modelo exige reindexar tudo; nunca é só editar a linha.
- **Boletim:** modelo só entra numa cascata com `boletim` (papel, prova, nota, data) naquele papel.
- Preço ausente é `null`, nunca zero.
- `divergences` lista divergências achadas nos produtos (onde/o quê/risco). Some quando resolvida ou vira
  override com razão.

## Modelos locais

- Provedor `local`: Ollama no contêiner dos modelos próprios. `extraBody` leva `reasoning_effort: "none"`
  (o Ollama liga o raciocínio do Qwen3 sozinho pela API compatível; `think: false` é ignorado ali).
- `requiredEnvKeys` diz qual variável falta antes de subir, mas não coloca a chave no ambiente: provedor novo
  ainda pede a variável em cada produto que o usa.
- `passosDoPapel(papel, produto, env)` **deixa de fora o passo cuja chave não veio**. O produto liga o local com
  `MODELOS_LOCAIS_KEY` no env.

## Registro do coletor no boot (`carregar.ts`)

- *Coletor fora do ar nunca impede um produto de atender cliente.*
- **Nunca lança**: rede caída, 404, 500, JSON quebrado → cópia compilada.
- **Tem prazo** (3 s padrão): coletor pendurado não segura o boot.
- **É explícito**: `resolveRole` nunca vai à rede sozinho.
- **Confere o que chegou**: papel apontando para modelo inexistente, ou papel que **sumiu**, é recusado.
- **Diz de onde veio**: `fonteDoRegistro()` e `aoTerminar` com o motivo.
- O TIPO `Role` vem da cópia compilada; os DADOS vêm do registro em uso.
- 🔴 **Ordem de deploy:** papel ou provedor novo vai ao ar no coletor **antes** da lib nova nos produtos.
  Ao contrário, eles recusam a edição do coletor e caem na cópia compilada.
