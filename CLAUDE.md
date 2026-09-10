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

**Provedor também é dado.** `providers` no mesmo JSON traz `api`, `baseUrl`,
`envKey` e `verified`. Quase todo provedor fala a API da OpenAI — DeepSeek,
Moonshot, Together, Fireworks e OpenRouter mudam a URL e mais nada —, então
acrescentar um é escrever uma entrada, não mexer em adapter. `deepseek`,
`moonshot`, `together`, `fireworks` e `openrouter` já estão declarados, com
`verified: false`: a baseUrl foi escrita de memória e **nenhum papel pode
apontar para elas** até alguém confirmar na doc do provedor e virar a flag. Há
teste travando, e o precedente é o `models.yaml` do VanguardAI, que registra a
data de cada conferência ao vivo porque URL e catálogo mudam sem aviso.

**Produtos pedem papel, não modelo:** `conversa`, `redacao`, `raciocinio`,
`classificacao`, `visao`, `embedding`, `transcricao`, `imagem`. Trocar de modelo
vira uma linha editada num arquivo.

```ts
import { resolveRole, requiredEnvKeys, envKeyOf, completeWithFallback } from '@upgrade/llm-client'

// Na subida: falha aqui, não na primeira chamada em produção.
for (const chave of requiredEnvKeys('conversa', 'AGENTEUP')) {
  if (!process.env[chave]) throw new Error(`falta ${chave}`)
}

const steps = resolveRole('conversa', 'AGENTEUP')   // [{model, provider, providerSpec}, ...]
await completeWithFallback(
  { useCase: 'lead_chat', steps: steps.map((s) => ({ ...s, apiKey: process.env[envKeyOf(s.provider)]! })) },
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

### Compatibilidade: os três nativos não mudaram

`anthropic`, `openai` e `groq` continuam funcionando sem `providerSpec` — é o
que mantém rodando todo consumidor escrito antes do registro. Provedor fora dos
três **exige** spec, e a falta dela falha na hora com o nome do provedor:
adivinhar URL é o tipo de chute que só aparece em produção.

O Groq segue no `groq-sdk` em vez de OpenAI+baseUrl. Equivalente no papel, mas
é o que roda em produção nos quatro produtos — risco sem ganho. O registro
descreve o que É, não o que seria mais bonito.

### Embedding tem cascata de um elemento só

Cair para outro modelo de embedding produz vetores de outro espaço, que não são
comparáveis com os já indexados. A busca não falharia — devolveria resultado
errado em silêncio. Trocar ali exige reindexar tudo; nunca é só editar a linha.

## Dois pontos de entrada

```ts
import { LLMClient, completeWithFallback } from '@upgrade/llm-client'          // fala com provedor
import { resolveRole, carregarRegistro } from '@upgrade/llm-client/registro'   // só lê o registro
```

O subcaminho existe porque nem todo produto usa o cliente. O EmailSeller faz
streaming direto na Anthropic e tem reporter de uso próprio — e ainda assim se
beneficia de LER o registro para saber qual modelo usar. Sem o subcaminho, a
escolha era carregar três SDKs de provedor para resolver uma string, ou manter o
id cravado no produto: o problema que o registro existe para acabar.

Medido, não suposto: a raiz carrega **135** módulos de SDK, o subcaminho carrega
**zero**. Há teste medindo o grafo real num processo separado, com a raiz como
contraprova — sem ela, um erro no filtro faria o teste passar sempre, medindo
zero por não casar com nada.

### O que o subcaminho NÃO resolve

**Ele evita CARREGAR os SDKs, não INSTALAR.** As dependências do pacote
(`@anthropic-ai/sdk`, `openai`, `groq-sdk`) continuam entrando no
`node_modules` e na imagem de quem instala a lib, mesmo importando só o
subcaminho. O ganho é de tempo de boot e memória, não de tamanho.

Para resolver o tamanho, os SDKs teriam de virar `peerDependencies` opcionais —
e aí os quatro produtos que já consomem a lib passariam a declarar os provedores
que usam. É mudança maior, e não foi feita.

### Ao mexer no subcaminho

Declarar `exports` **fecha** o pacote: subcaminho não declarado deixa de
resolver. A entrada `"."` tem de continuar lá, senão os quatro produtos que
fazem `require('@upgrade/llm-client')` param de resolver de uma vez.

E `main`/`types` continuam no package.json, mais um diretório-stub
`registro/package.json` apontando para `../dist/registro.js`: resolvedor
TypeScript clássico (`moduleResolution: node`) ignora `exports` por completo, e
os consumidores estão em configurações diferentes. Um subcaminho que funciona na
metade deles seria pior que não existir.

## O registro vem do coletor, no boot

```ts
import { carregarRegistro, fonteDoRegistro } from '@upgrade/llm-client'

// Uma vez, na subida do produto.
await carregarRegistro({
  collectorUrl: process.env.AI_USAGE_URL!,
  apiKey: process.env.AI_USAGE_API_KEY!,
  aoTerminar: (r) => logger.info(r, '[llm] registro de modelos'),
})
```

O que o `ai-usage-collector` publica pelo console vira a configuração do
produto no restart seguinte. Trocar um modelo deixou de custar seis deploys.

**A frase que manda em tudo aqui:** *coletor fora do ar nunca pode impedir um
produto de atender cliente.* Um produto que não sobe porque o serviço de
faturamento caiu é um estrago muito maior do que rodar com a configuração da
semana passada. Daí:

- **Nunca lança.** Rede caída, 404, 500, JSON quebrado — tudo cai na cópia
  compilada que veio no pacote.
- **Tem prazo** (3s por padrão). Um coletor que aceita a conexão e não responde
  é pior que um fora do ar: sem prazo, o produto fica subindo para sempre e
  nenhum healthcheck acusa, porque o processo está vivo.
- **É explícito.** Não busca sozinho na primeira chamada de `resolveRole`, o
  que poria uma ida à rede dentro do caminho de uma resposta ao cliente. Quem
  não chama continua na cópia compilada — que é como a lib se comportava antes
  disto existir, e é o que permite migrar um produto de cada vez.
- **Confere o que chegou.** Registro incoerente vindo da rede é PIOR que o
  compilado, que ao menos foi revisado quando entrou no pacote. Um papel
  apontando para modelo inexistente, ou um papel que SUMIU da edição nova, é
  recusado — publicar sem o papel `transcricao` derrubaria todo produto que o
  usa, no boot seguinte deles, longe de quem publicou.
- **Diz de onde veio.** `fonteDoRegistro()` devolve `'compilado'` ou
  `'coletor'`, e `aoTerminar` recebe o motivo quando caiu. Sem isso, "por que
  este produto está com o modelo antigo?" vira investigação em vez de uma linha
  de log.

O TIPO `Role` vem da cópia compilada; os DADOS vêm do registro em uso. É a
divisão certa: o compilador só conhece o que estava no pacote no build, mas o
registro em uso pode ter papéis acrescentados depois.

## O que ainda NÃO resolve

**A chave.** Um provedor novo ainda precisa da variável dele em cada ambiente
que o usa. `requiredEnvKeys` diz qual falta antes de subir, mas não coloca a
chave lá. Some de vez com um gateway (OpenRouter ou um nosso): uma chave por
produto, e a escolha de provedor deixa de existir do lado do produto.

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
