export type FonteDoRegistro = 'compilado' | 'coletor';
export interface Registro {
    version: number;
    providers: Record<string, {
        api?: string;
        baseUrl?: string;
        sdk?: string;
        envKey: string;
        verified: boolean;
    }>;
    models: Record<string, {
        provider: string;
        measuredEngine?: boolean;
    }>;
    roles: Record<string, {
        description: string;
        cascade: string[];
    }>;
    products: Record<string, {
        roles?: Record<string, {
            cascade: string[];
            reason?: string;
        }>;
    }>;
}
export interface CarregarOpcoes {
    collectorUrl: string;
    apiKey: string;
    timeoutMs?: number;
    aoTerminar?: (r: ResultadoDaCarga) => void;
}
export interface ResultadoDaCarga {
    fonte: FonteDoRegistro;
    version: number;
    motivo?: string;
}
export declare function registroAtual(): Registro;
export declare function fonteDoRegistro(): FonteDoRegistro;
export declare function redefinirRegistro(): void;
export declare function carregarRegistro(opcoes: CarregarOpcoes): Promise<ResultadoDaCarga>;
