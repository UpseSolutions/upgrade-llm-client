import type { Falha, ModeloAberto, ModeloHospedado } from './fontes';
import { type Criterio, type Escada, type PisoDoPapel } from './piso';
export interface Opcoes {
    hoje: string;
    dias: number;
    tetoB: number;
    maximoPorLista: number;
}
export declare const OPCOES_PADRAO: Omit<Opcoes, 'hoje'>;
export type Licenca = 'livre' | 'conferir' | 'sem_uso_comercial';
export interface Candidato extends ModeloAberto {
    licencaUso: Licenca;
}
export interface AchadoDoPapel {
    papel: string;
    piso: PisoDoPapel;
    reabrePiso: Candidato[];
    mesmaFaixa: Candidato[];
}
export interface Triagem {
    hoje: string;
    dias: number;
    papeis: AchadoDoPapel[];
    pequenosNovos: Candidato[];
    hospedadosNovos: ModeloHospedado[];
    referenciaHospedado: {
        modelo: string;
        saidaPorMTok: number;
    } | null;
    falhas: Falha[];
    achados: number;
}
export declare function classificarLicenca(licenca: string | null): Licenca;
export declare function triar(abertos: ModeloAberto[], hospedados: ModeloHospedado[], escadas: Record<string, Escada>, criterio: Criterio, precos: {
    modelo: string;
    saidaPorMTok: number;
}[], falhas: Falha[], opcoes: Opcoes): Triagem;
export declare function relatorio(t: Triagem): string;
