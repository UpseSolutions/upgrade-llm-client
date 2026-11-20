import type { Achado, Comparacao, Gravidade } from './regras';
export declare function contagem(achados: Achado[]): Record<Gravidade, number>;
export declare function assunto(achados: Achado[], cmp: Comparacao): string;
export declare function markdown(achados: Achado[], cmp: Comparacao, dia: string, resumo: string | null): string;
export declare function html(achados: Achado[], cmp: Comparacao, dia: string, resumo: string | null): string;
