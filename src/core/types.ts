// Os três provedores que a lib já falava antes de o registro existir. O union
// continua fechado de propósito: é o que os quatro produtos em produção passam
// hoje, e alargá-lo tiraria a exaustividade sem ganhar nada.
export type Provider = 'anthropic' | 'openai' | 'groq';

// Qualquer provedor, inclusive os que entram pelo registro (deepseek, moonshot,
// together, openrouter…). O `(string & {})` mantém o autocomplete dos três
// acima sem fechar a porta para os outros.
export type ProviderId = Provider | (string & {});

// Como se fala com o provedor. São só duas famílias na prática — e é isso que
// torna barato acrescentar provedor: DeepSeek, Moonshot, Together, Fireworks e
// OpenRouter são todos OpenAI-compatíveis, mudam a URL e nada mais.
export type ProviderApi = 'anthropic' | 'openai-compatible';

export interface ProviderSpec {
  // Ausente = provedor declarado no registro mas não falado por este cliente
  // (ex: google, que só existe no catálogo para ter preço). resolveRole recusa.
  api?: ProviderApi;
  // Ausente = URL padrão do SDK. É este campo, e só ele, que faz um provedor
  // novo funcionar sem tocar em código.
  baseUrl?: string;
  // Exceção documentada: o Groq usa o groq-sdk desde antes do registro, e ele
  // roda em produção nos quatro produtos. Trocar por OpenAI+baseUrl seria
  // equivalente no papel, mas é risco sem ganho — o registro descreve o que É,
  // não o que seria mais bonito.
  sdk?: 'groq';
}

export type Product =
  | 'HADRIANS'
  | 'GOLDANALYZER'
  // ALFABETIA é o Kompetent (kompetent.com.br) desde o pivot de 15/08/2026;
  // a AlfabetIA virou a vertical infantil dentro dele. O identificador não
  // muda porque é a chave sob a qual o histórico de uso foi gravado —
  // renomear partiria a série em duas. Ver o CLAUDE.md do repo alfabetia.
  | 'ALFABETIA'
  | 'AGENTEUP'
  | 'CONTENTSELLER'
  | 'EMAILSELLER';

export interface LLMMessage {
  role: 'user' | 'assistant';
  // string cobre o caso simples. Loop agêntico (tool_use/tool_result) e
  // visão (image blocks) precisam de blocos de conteúdo nativos do
  // provedor — a lib não traduz esse formato entre provedores (mesmo
  // motivo de `tools` ser unknown), então aceita o array nativo como veio.
  content: string | unknown[];
}

export interface CompleteParams {
  provider: ProviderId;
  // Como falar com esse provedor. Opcional por compatibilidade: quem passa
  // 'anthropic', 'openai' ou 'groq' sem spec continua funcionando igual.
  // Provedor fora dos três EXIGE spec — sem ela a lib não tem como saber a URL.
  providerSpec?: ProviderSpec;
  apiKey: string;
  model: string;
  messages: LLMMessage[];
  system?: string;
  maxTokens: number;
  temperature?: number;
  // Formato de tool nativo do provedor — a lib não traduz schema de tool
  // entre Anthropic/OpenAI/Groq (ver escopo do plano), quem chama já sabe o
  // formato que o provedor escolhido espera.
  tools?: unknown[];
  // Nome do caso de uso pro reporte de custo (ex: "hadrian_chat",
  // "kit_generation") — não é opcional porque visibilidade de custo é o
  // propósito central da lib.
  feature: string;
  // Repassado direto pro SDK do provedor (mesmo padrão de `tools` — sem
  // reimplementar nada). Sem isso um caller que hoje usa AbortController
  // com timeout próprio (padrão comum antes de existir a lib) perderia
  // esse comportamento na migração.
  signal?: AbortSignal;
  // Só usado por completeStream — chamado quando o stream termina, com a
  // mensagem final reconstruída pelo SDK (stream.finalMessage() da
  // Anthropic; undefined pra OpenAI/Groq, sem equivalente nativo).
  // Necessário pra loop agêntico com tools durante streaming: sem os
  // content blocks completos, quem chama não sabe se deve continuar
  // (stop_reason) nem consegue montar o próximo turno da conversa.
  onFinalMessage?: (raw: unknown) => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface CompletionResult {
  text: string;
  usage: TokenUsage;
  // Resposta nativa completa do SDK do provedor — quem chama acessa
  // tool_use blocks, stop_reason etc a partir daqui quando precisar de mais
  // que o texto.
  raw: unknown;
}

// Valor de retorno (`return`) do generator de completeStream — usage pro
// reporter, raw pro onFinalMessage (ver CompleteParams.onFinalMessage).
export interface StreamCompletionResult {
  usage: TokenUsage;
  raw: unknown;
}
