export type Buscar = (url: string) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
export interface ModeloAberto {
    id: string;
    autor: string;
    criadoEm: string;
    parametrosB: number | null;
    licenca: string | null;
    tipo: string;
    downloads: number;
    origem: 'autor' | 'tendencia';
}
export interface ModeloHospedado {
    id: string;
    nome: string;
    criadoEm: string;
    entradaPorMTok: number;
    saidaPorMTok: number;
    ferramentas: boolean;
    gratis: boolean;
}
export interface Falha {
    fonte: string;
    motivo: string;
}
export declare const AUTORES: string[];
interface CruHF {
    id: string;
    createdAt?: string;
    pipeline_tag?: string;
    downloads?: number;
    safetensors?: {
        total?: number;
    };
    cardData?: {
        license?: string;
        base_model?: string | string[];
    };
}
export declare function tamanhoPeloNome(id: string): number | null;
export declare function normalizarAberto(m: CruHF, origem: ModeloAberto['origem']): ModeloAberto | null;
export declare function buscarAbertos(buscar: Buscar, autores?: string[]): Promise<{
    modelos: ModeloAberto[];
    falhas: Falha[];
}>;
export declare function buscarHospedados(buscar: Buscar): Promise<{
    modelos: ModeloHospedado[];
    falhas: Falha[];
}>;
export {};
