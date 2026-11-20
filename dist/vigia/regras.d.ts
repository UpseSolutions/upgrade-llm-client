export type Gravidade = 'critica' | 'alta' | 'media' | 'info';
export interface Achado {
    id: string;
    gravidade: Gravidade;
    area: 'containers' | 'sites' | 'certificados' | 'backups' | 'logs' | 'recursos';
    titulo: string;
    detalhe: string;
    acao: string;
}
export interface Container {
    nome: string;
    estado: string;
    saude: string;
    reinicios: number;
}
export interface Site {
    url: string;
    status: number;
    segundos: number;
}
export interface Certificado {
    dominio: string;
    diasOrigem: number | null;
    atrasDaCloudflare: boolean;
    falhasRenovacao: number;
}
export interface Banco {
    container: string;
    idadeBackupHoras: number | null;
}
export interface Assinatura {
    container: string;
    regra: string;
    ocorrencias: number;
    exemplo: string;
}
export interface Fatos {
    containers: Container[];
    sites: Site[];
    certificados: Certificado[];
    bancos: Banco[];
    logs: Assinatura[];
    discoPct: number;
    memoriaLivreMb: number;
}
export interface RegraDeLog {
    nome: string;
    padrao: string;
    gravidade: Gravidade;
    explica: string;
    acao: string;
}
export interface Config {
    reinicioEsperado: string[];
    backupMaxHoras: number;
    certificadoMinDias: number;
    discoMaxPct: number;
    memoriaMinMb: number;
    semBackupAceito: Record<string, string>;
    regrasDeLog: RegraDeLog[];
}
export declare function zona(dominio: string): string;
export declare function avaliar(f: Fatos, cfg: Config): Achado[];
export interface Comparacao {
    novos: Achado[];
    persistentes: Achado[];
    resolvidos: string[];
}
export declare function comparar(atuais: Achado[], idsAnteriores: string[]): Comparacao;
