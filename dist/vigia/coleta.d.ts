import type { Assinatura, Banco, Certificado, Container, Fatos, RegraDeLog, Site } from './regras';
export type Rodar = (comando: string, prazoMs?: number) => string;
export type Buscar = (url: string) => Promise<{
    status: number;
    segundos: number;
}>;
export interface Alvos {
    sites: string[];
    dominios: string[];
    bancos: Record<string, string | null>;
    pastaBackups: string;
    traefik: string;
    janelaHoras: number;
    ignorarLogs: string[];
}
export declare function semSegredo(texto: string): string;
export declare function coletarContainers(rodar: Rodar): Container[];
export declare function coletarSites(urls: string[], buscar: Buscar): Promise<Site[]>;
export declare function coletarCertificados(dominios: string[], traefik: string, janelaHoras: number, rodar: Rodar, agora: Date): Certificado[];
export declare function coletarBancos(alvos: Alvos, rodar: Rodar, agora: Date): Banco[];
export declare function coletarLogs(regras: RegraDeLog[], alvos: Alvos, rodar: Rodar): Assinatura[];
export declare function coletar(alvos: Alvos, regras: RegraDeLog[], rodar: Rodar, buscar: Buscar, agora: Date): Promise<Fatos>;
