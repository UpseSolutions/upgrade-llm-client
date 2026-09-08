# @upgrade/llm-client

Wrapper fino sobre Anthropic/OpenAI/Groq com cascata de fallback e reporte de
uso para o coletor central. É a Fase 1 do Gateway de LLM da Upgrade Soluções.

Consumido por **agenteup, contentseller, alfabetia e goldanalyzer** via
`"@upgrade/llm-client": "github:UpseSolutions/upgrade-llm-client#main"`.
`dist/` é versionado — quem instala do GitHub recebe o build pronto. Se você
mexer em `src/`, rode `npm run build` e commite o `dist/` junto, senão os
produtos continuam com a versão anterior.

## Regras que não se quebram

**A lib nunca lê env var.** Tudo entra por parâmetro; quem instancia decide de
onde vêm as chaves. Vale para o registro de modelos também: ele diz QUAL modelo
e de QUAL provedor, nunca com que credencial.

**A lib não traduz formato entre provedores.** `tools` e blocos de conteúdo
(tool_use, imagem) vão como o provedor nativo espera — por isso são `unknown[]`.
Quem chama já sabe o formato do provedor que escolheu.

**Cascata é para indisponibilidade, não para mascarar bug.** Erro não-retryable
(400 de validação, por exemplo) propaga na hora, sem tentar o próximo step.

**Build incremental morde.** Se você apagar `dist/` e rodar `npm run build`, o
`.tsbuildinfo` faz o tsc achar que está tudo em dia e emitir quase nada. Apague
o `*.tsbuildinfo` junto.

## O registro de modelos (`src/models/models.json`)

Fonte da verdade de qual modelo cada papel usa, em todo o portfólio. Criado em
08/09/2026, depois de uma varredura achar ~70 identificadores de modelo cravados
em oito repositórios — com o emailseller parado em `claude-sonnet-4-6` enquanto
todo o resto já estava em `sonnet-5`, e um `claude-opus-4-5` solto no
contentseller que ninguém sabia que existia.

**É JSON, não TypeScript.** hadrians e vanguardai são Python; um registro que só
o TS enxerga deixaria dois produtos de fora, que é a situação que ele veio
arrumar. O `models.json` é emitido para `dist/models/` no build
(`resolveJsonModule`), e o Python lê o arquivo direto.

**Produtos pedem papel, não modelo:** `conversa`, `redacao`, `raciocinio`,
`classificacao`, `visao`, `embedding`, `transcricao`, `imagem`. Trocar de modelo
vira uma linha editada num arquivo.

```ts
import { resolveRole, completeWithFallback } from '@upgrade/llm-client'

const steps = resolveRole('conversa', 'AGENTEUP')   // [{model, provider}, ...]
await completeWithFallback(
  { useCase: 'lead_chat', steps: steps.map((s) => ({ ...s, apiKey: chaveDe(s.provider) })) },
  { messages, maxTokens: 1024, feature: 'lead_chat' },
)
```

### Duas coisas que o registro trava de propósito

**Motor medido ≠ ferramenta.** Em hadrians (`ai_visibility_collector.py`,
`brand_xray_service.py`) o produto pergunta a vários motores o que eles dizem
sobre a marca do cliente. Ali `gemini-2.0-flash` é o OBJETO da medição, não uma
escolha de ferramenta: trocá-lo por algo mais novo não melhora nada — muda o que
está sendo medido e torna os snapshots históricos incomparáveis. O produto
continuaria respondendo normalmente, que é o que faz esse erro ser caro. Modelo
marcado `measuredEngine` entra no catálogo (precisa de preço) e `resolveRole`
recusa usá-lo, com erro explícito.

**Override de produto exige `reason`.** Divergência sem razão escrita é
exatamente o que espalhou os modelos por oito repos. Se não há razão que se
escreva, use o default. `resolveRole` lança se faltar.

### Embedding tem cascata de um elemento só

Cair para outro modelo de embedding produz vetores de outro espaço, que não são
comparáveis com os já indexados. A busca não falharia — devolveria resultado
errado em silêncio. Trocar ali exige reindexar tudo; nunca é só editar a linha.

## Migração: o que falta

Nenhum produto foi migrado ainda. O registro existe e não muda comportamento de
ninguém. A ordem sugerida, do menor para o maior:

1. **goldanalyzer** (5 ocorrências) e **emailseller** (4) — a migração do
   emailseller já corrige o atraso dele.
2. **alfabetia** (6 arquivos) e **hadrians** (Python — precisa do leitor).
3. **agenteup** (~30, com `openai.service.js` concentrando 20) e
   **contentseller** (~22, com `workers/claude.ts` concentrando 12).

Depois, `pricing.ts` do **ai-usage-collector** passa a consumir `modelCatalog()`
em vez de manter a própria lista. Enquanto isso não acontece, os dois podem
divergir — e já divergem: `gemini-2.0-flash` roda em produção no hadrians e não
existe no `pricing.ts`, ou seja, esse consumo não está sendo precificado.

As divergências encontradas na varredura estão em `divergences`, dentro do
próprio `models.json`, com onde/o quê/risco. Cada uma some de lá quando for
resolvida — ou ganha uma razão e vira override permanente.

## Não confundir com o VanguardAI

`vanguardai/config/models.yaml` é outro registro, com outro propósito: tiers de
custo para o Router do VI, com LiteLLM. Não é duplicata deste — e vale lê-lo
antes de mexer em qualquer coisa Kimi/Moonshot, porque ele guarda verificações
feitas ao vivo contra o catálogo dos provedores (em 2026-08-09, por exemplo:
a Moonshot nunca expôs `kimi-k3`, só `kimi-k2.6` e `kimi-k2.7-code`, e a conta
está suspensa — o tier4 foi migrado para a Together).
