import { completeWithFallback } from '../fallback/cascade';
import type { Achado, Comparacao } from './regras';
export declare const INSTRUCAO: string;
export declare function entradaDoResumo(achados: Achado[], cmp: Comparacao): string;
export declare function escreverResumo(achados: Achado[], cmp: Comparacao, chaves: Record<string, string | undefined>, chamar?: typeof completeWithFallback): Promise<{
    texto: string | null;
    modelo?: string;
    motivo?: string;
}>;
