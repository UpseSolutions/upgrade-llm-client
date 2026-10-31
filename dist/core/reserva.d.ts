import { CompleteParams } from './types';
export interface ReservaAnthropic {
    principal?: string;
    reserva?: string;
    limitePorHora?: Record<string, number>;
    aviso?: (mensagem: string) => void;
}
export declare const PAUSA_SEM_CREDITO_MS: number;
export declare const LIMITE_POR_HORA_PADRAO = 60;
export declare function configurarReservaAnthropic(novo: ReservaAnthropic | null): void;
export declare function semCredito(err: unknown): boolean;
export declare function comReserva<T>(params: CompleteParams, chamar: (p: CompleteParams) => Promise<T>): Promise<T>;
export declare const FEATURE_SDK_DIRETO = "sdk_direto";
export declare const fetchComReservaAnthropic: typeof fetch;
