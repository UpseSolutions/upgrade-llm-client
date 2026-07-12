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
  content: string;
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
