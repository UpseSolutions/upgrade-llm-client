export interface Rodada {
    versao: string;
    em: string;
    notas: Record<string, number>;
    modelo?: string;
    obs?: string;
}
export interface Degrau {
    base: string;
    parametrosB: number;
    rodadas: Rodada[];
}
export interface Escada {
    descricao?: string;
    degraus: Degrau[];
}
export interface Criterio {
    notaMinima: number;
    rodadasParaLimite: number;
    ganhoMinimoPp: number;
    mudancaQueContaPp: number;
}
export type Veredito = 'aprovado' | 'em_aberto' | 'no_limite';
export interface VereditoDoDegrau {
    base: string;
    parametrosB: number;
    veredito: Veredito;
    piorNota: number | null;
    rodadas: number;
    motivo: string;
}
export interface PisoDoPapel {
    estado: 'provado' | 'provisorio' | 'sem_piso';
    piso: VereditoDoDegrau | null;
    degraus: VereditoDoDegrau[];
    motivo: string;
}
export declare function vereditoDoDegrau(degrau: Degrau, c: Criterio): VereditoDoDegrau;
export declare function pisoDoPapel(escada: Escada, c: Criterio): PisoDoPapel;
