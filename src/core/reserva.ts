import { CompleteParams } from './types';

/**
 * Chave reserva da Anthropic (outra conta): só entra quando a principal responde
 * "sem crédito". É reserva, não divisão de carga. Decisão do dono em 18/10/2026
 * no GoldAnalyzer, trazida para a lib em 31/10/2026 para valer nos outros produtos.
 *
 * Vale só para a chave PRINCIPAL da plataforma: a chave própria de um cliente sem
 * crédito não pode cair na reserva, senão a Upgrade pagaria a conta dele.
 */
export interface ReservaAnthropic {
  principal?: string;
  reserva?: string;
  /** Chamadas por hora na reserva, por feature. Ausente = LIMITE_POR_HORA_PADRAO. */
  limitePorHora?: Record<string, number>;
  aviso?: (mensagem: string) => void;
}

/** Depois de um "sem crédito", a principal fica de fora por este tempo. */
export const PAUSA_SEM_CREDITO_MS = 15 * 60_000;

/**
 * Freio de gasto. Em 19/10/2026 um cache errado no GoldAnalyzer fez 2.077 chamadas
 * num dia e queimou US$ 16, o saldo inteiro da reserva. Aqui ela é uma conta só
 * para todos os produtos, então um laço em um deles pararia os outros.
 */
export const LIMITE_POR_HORA_PADRAO = 60;

// Do processo, não de cada cliente: há produto com vários LLMClient, e a conta
// sem crédito é a mesma para todos.
let config: ReservaAnthropic | null = null;
let principalSemCreditoAte = 0;
let reservaSemCreditoAte = 0;
const chamadas = new Map<string, number[]>();

/** Uma vez, na subida de cada processo. A lib não lê env var: quem chama passa as chaves. */
export function configurarReservaAnthropic(novo: ReservaAnthropic | null): void {
  config = novo?.principal && novo.reserva ? novo : null;
  principalSemCreditoAte = 0;
  reservaSemCreditoAte = 0;
  chamadas.clear();
}

/**
 * A Anthropic recusa por falta de crédito com HTTP 400 e a mensagem "Your credit
 * balance is too low to access the Anthropic API". Só ESTE erro passa para a
 * reserva: chave inválida, modelo errado ou pedido malformado falhariam igual na
 * outra conta e só dobrariam o gasto.
 */
export function semCredito(err: unknown): boolean {
  const e = err as { message?: string; error?: { error?: { message?: string } } };
  const msg = `${e?.message ?? ''} ${e?.error?.error?.message ?? ''}`.toLowerCase();
  return msg.includes('credit balance');
}

function avisar(mensagem: string): void {
  (config?.aviso ?? console.error)(`[llm-client] ${mensagem}`);
}

function naReserva(params: CompleteParams): CompleteParams {
  const agora = Date.now();
  const lista = (chamadas.get(params.feature) ?? []).filter((t) => agora - t < 3600_000);
  const limite = config!.limitePorHora?.[params.feature] ?? LIMITE_POR_HORA_PADRAO;
  chamadas.set(params.feature, lista);
  if (lista.length >= limite) {
    if (lista.length === limite) {
      lista.push(agora); // avisa uma vez só, até a janela esvaziar
      avisar(`${params.feature} passou de ${limite} chamadas por hora na reserva da Anthropic. Chamada em laço?`);
    }
    throw new Error(`limite de ${limite} chamadas de IA por hora na reserva (${params.feature})`);
  }
  lista.push(agora);
  return { ...params, apiKey: config!.reserva! };
}

function escolher(params: CompleteParams): CompleteParams {
  if (!config || params.provider !== 'anthropic' || params.apiKey !== config.principal) return params;
  if (Date.now() >= principalSemCreditoAte) return params;
  // As duas sem crédito: nem chama. A mensagem mantém "credit balance" porque é
  // ela que aciona o Groq nos produtos que têm esse caminho.
  if (Date.now() < reservaSemCreditoAte) throw new Error('Anthropic sem crédito (credit balance) nas duas contas, pausado');
  return naReserva(params);
}

function depoisDaRecusa(usados: CompleteParams, err: unknown): CompleteParams | null {
  if (!config || usados.provider !== 'anthropic' || !semCredito(err)) return null;
  const minutos = PAUSA_SEM_CREDITO_MS / 60_000;
  if (usados.apiKey === config.reserva) {
    reservaSemCreditoAte = Date.now() + PAUSA_SEM_CREDITO_MS;
    avisar(`Reserva da Anthropic também SEM CRÉDITO (${usados.feature}): pausada por ${minutos} min.`);
    return null;
  }
  if (usados.apiKey !== config.principal) return null;
  principalSemCreditoAte = Date.now() + PAUSA_SEM_CREDITO_MS;
  if (Date.now() < reservaSemCreditoAte) return null;
  avisar(`Chave principal da Anthropic SEM CRÉDITO (${usados.feature}): usando a reserva por ${minutos} min.`);
  return naReserva(usados);
}

/**
 * Chama com a chave da vez e, na recusa por saldo, repete uma vez com a reserva.
 * Passada a pausa, tenta a principal de novo: crédito comprado volta a ser usado
 * sozinho, sem mexer no ambiente.
 */
export async function comReserva<T>(params: CompleteParams, chamar: (p: CompleteParams) => Promise<T>): Promise<T> {
  const usados = escolher(params);
  try {
    return await chamar(usados);
  } catch (err) {
    const outra = depoisDaRecusa(usados, err);
    if (!outra) throw err;
    try {
      return await chamar(outra);
    } catch (errNaReserva) {
      depoisDaRecusa(outra, errNaReserva);
      throw errNaReserva;
    }
  }
}
