/**
 * O registro de modelos, sem os SDKs dos provedores.
 *
 * Ponto de entrada alternativo: `@upgrade/llm-client/registro`.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * Importar a raiz do pacote traz `@anthropic-ai/sdk`, `openai` e `groq-sdk`,
 * porque é isso que o cliente precisa para falar com os três. Nem todo produto
 * precisa do cliente: o EmailSeller faz streaming direto na Anthropic e tem
 * reporter de uso próprio, e ainda assim se beneficiaria de ler o registro para
 * saber qual modelo usar.
 *
 * Sem este arquivo, a alternativa era carregar três SDKs de provedor num
 * produto que usa um, para resolver uma string. Isso não se paga, e a escolha
 * que sobrava era manter o id cravado no produto — que é o problema que o
 * registro existe para acabar.
 *
 * ── O que este módulo NÃO importa ───────────────────────────────────────────
 *
 * Nenhum SDK. Em tempo de execução ele carrega apenas `models.json` e a busca
 * no coletor, que usa o `fetch` nativo. Os tipos vindos de `core/types` são
 * apagados na compilação. Há teste conferindo o grafo real: depois de carregar
 * este módulo, nada de `anthropic`, `openai` ou `groq` aparece no cache de
 * módulos.
 *
 * Quem chama de fato os provedores continua importando a raiz.
 */

export {
  Role,
  ResolvedModel,
  CatalogEntry,
  resolveRole,
  requiredEnvKeys,
  envKeyOf,
  providerSpecOf,
  modelCatalog,
  roles,
  providerIds,
  registryVersion,
  REGISTRY_VERSION,
} from './models/registry';

export {
  carregarRegistro,
  fonteDoRegistro,
  registroAtual,
  redefinirRegistro,
  FonteDoRegistro,
  CarregarOpcoes,
  ResultadoDaCarga,
  Registro,
} from './models/carregar';

export { Provider, ProviderId, ProviderApi, ProviderSpec, Product } from './core/types';
