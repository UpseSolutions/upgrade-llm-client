export type Provider = 'anthropic' | 'openai' | 'groq';

export type Product =
  | 'HADRIANS'
  | 'GOLDANALYZER'
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
  provider: Provider;
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
