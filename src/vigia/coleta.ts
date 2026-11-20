// A coleta do vigia: a única parte que fala com a máquina (docker, openssl, disco, rede).
// Roda NA VPS, como root, porque precisa ver containers, logs e a pasta de backups — coisa que
// um GitHub Actions não enxerga. Cada comando é trocável nos testes (`Rodar`, `Buscar`).
//
// Nunca lê .env de produto e nunca imprime segredo: só estado, contagens e um exemplo curto de
// cada assinatura de erro (que passa por `semSegredo` antes de sair daqui).

import type { Assinatura, Banco, Certificado, Container, Fatos, RegraDeLog, Site } from './regras';

export type Rodar = (comando: string, prazoMs?: number) => string;
export type Buscar = (url: string) => Promise<{ status: number; segundos: number }>;

export interface Alvos {
  /** Endereços de saúde: o que precisa responder 2xx/3xx. */
  sites: string[];
  /** Domínios cujo certificado da origem é conferido (SNI na própria VPS). */
  dominios: string[];
  /** container do banco → prefixo do arquivo em `pastaBackups` (null = ainda sem backup). */
  bancos: Record<string, string | null>;
  pastaBackups: string;
  /** Containers do Traefik (para as falhas de renovação). */
  traefik: string;
  /** Janela dos logs. */
  janelaHoras: number;
  /** Containers cujos logs não interessam (os runners do CI, por exemplo). */
  ignorarLogs: string[];
}

const IPS_CLOUDFLARE = /^(104\.(1[6-9]|2[0-9]|3[01])\.|172\.(6[4-9]|7[01])\.|188\.114\.|162\.15[89]\.|141\.101\.|108\.162\.|190\.93\.|197\.234\.|198\.41\.|173\.245\.|103\.(21|22|31)\.)/;

/** Tira do exemplo o que pode ser segredo ou dado pessoal antes de ir para o relatório. */
export function semSegredo(texto: string): string {
  return texto
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/(sk|gsk|xai|AC|SK)[-_][A-Za-z0-9_-]{12,}/g, '[CHAVE]')
    .replace(/(Bearer|token|apikey|api_key|password|senha)["'=: ]+[^\s"',}]+/gi, '$1 [OCULTO]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[E-MAIL]')
    .replace(/org_[A-Za-z0-9]+/g, 'org_[OCULTO]')
    .replace(/\b\d{10,13}\b/g, '[NÚMERO]')
    .slice(0, 300);
}

export function coletarContainers(rodar: Rodar): Container[] {
  const linhas = rodar(`docker ps -a --format '{{.Names}}|{{.State}}|{{.Status}}'`).trim().split('\n').filter(Boolean);
  return linhas.flatMap((l) => {
    const [nome, estado, status] = l.split('|');
    // "Exited (0)" é job de uma vez só (migrate, keygen): terminou bem, não é problema.
    if (estado === 'exited' && /Exited \(0\)/.test(status)) return [];
    const reinicios = Number(rodar(`docker inspect -f '{{.RestartCount}}' ${nome}`).trim()) || 0;
    const saude = /\(unhealthy\)/.test(status) ? 'unhealthy' : /\(healthy\)/.test(status) ? 'healthy' : '';
    return [{ nome, estado: estado === 'exited' ? 'parado' : estado, saude, reinicios }];
  });
}

export async function coletarSites(urls: string[], buscar: Buscar): Promise<Site[]> {
  const out: Site[] = [];
  for (const url of urls) {
    try {
      out.push({ url, ...(await buscar(url)) });
    } catch {
      out.push({ url, status: 0, segundos: 0 });
    }
  }
  return out;
}

export function coletarCertificados(dominios: string[], traefik: string, janelaHoras: number, rodar: Rodar,
                                    agora: Date): Certificado[] {
  const log = rodar(`docker logs --since ${janelaHoras}h ${traefik} 2>&1 | grep -E 'Error renewing|Unable to obtain' || true`, 60_000);
  return dominios.map((d) => {
    const fim = rodar(`echo | timeout 8 openssl s_client -servername ${d} -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null || true`)
      .trim().replace('notAfter=', '');
    const quando = fim ? new Date(fim) : null;
    const diasOrigem = quando && !isNaN(+quando) ? Math.floor((+quando - +agora) / 86_400_000) : null;
    const ip = rodar(`getent ahostsv4 ${d} | head -1 | cut -d' ' -f1 || true`).trim();
    const falhasRenovacao = log.split('\n').filter((l) => l.includes(`{${d} `) || l.includes(`[${d}:`)).length;
    return { dominio: d, diasOrigem, atrasDaCloudflare: IPS_CLOUDFLARE.test(ip), falhasRenovacao };
  });
}

export function coletarBancos(alvos: Alvos, rodar: Rodar, agora: Date): Banco[] {
  // Todo container de banco em execução entra, mesmo os que ninguém pôs na configuração:
  // banco novo sem backup é exatamente o caso que precisa aparecer.
  const imagens = rodar(`docker ps --format '{{.Names}}|{{.Image}}'`).trim().split('\n').filter(Boolean);
  // Pela imagem OU pelo nome: a imagem pode ser só um hash (build local), e aí só o nome diz que é banco.
  const bancos = imagens.filter((l) => /postgres|pgvector|mariadb|mysql|mongo/i.test(l) || /(^|[-_])db([-_.|]|$)/i.test(l.split('|')[0]))
    .map((l) => l.split('|')[0])
    .filter((nome) => !/redis/i.test(nome));
  // A chave da configuração pode ser o PREFIXO do nome: container de serviço do Swarm
  // ganha um sufixo novo (".1.xxxx") a cada recriação.
  const prefixoDe = (nome: string) =>
    Object.entries(alvos.bancos).find(([k]) => nome === k || nome.startsWith(`${k}.`))?.[1] ?? null;
  return [...new Set(bancos)].map((container) => {
    const prefixo = prefixoDe(container);
    if (!prefixo) return { container, idadeBackupHoras: null };
    const epoch = rodar(`ls -1t ${alvos.pastaBackups}/${prefixo}-*.gz 2>/dev/null | head -1 | xargs -r stat -c %Y`).trim();
    return { container, idadeBackupHoras: epoch ? Math.round((+agora / 1000 - Number(epoch)) / 3600) : null };
  });
}

export function coletarLogs(regras: RegraDeLog[], alvos: Alvos, rodar: Rodar): Assinatura[] {
  const nomes = rodar(`docker ps --format '{{.Names}}'`).trim().split('\n').filter(Boolean)
    .filter((n) => !alvos.ignorarLogs.some((p) => new RegExp(p).test(n)));
  const out: Assinatura[] = [];
  for (const nome of nomes) {
    const log = rodar(`docker logs --since ${alvos.janelaHoras}h ${nome} 2>&1 | tail -n 20000`, 60_000);
    for (const r of regras) {
      const re = new RegExp(r.padrao, 'i');
      const linhas = log.split('\n').filter((l) => re.test(l));
      if (linhas.length) out.push({ container: nome, regra: r.nome, ocorrencias: linhas.length, exemplo: semSegredo(linhas[linhas.length - 1]) });
    }
  }
  return out;
}

export async function coletar(alvos: Alvos, regras: RegraDeLog[], rodar: Rodar, buscar: Buscar, agora: Date): Promise<Fatos> {
  const disco = Number(rodar(`df --output=pcent / | tail -1`).replace(/\D/g, '')) || 0;
  const memoria = Number(rodar(`free -m | awk '/^Mem:/{print $7}'`).trim()) || 0;
  return {
    containers: coletarContainers(rodar),
    sites: await coletarSites(alvos.sites, buscar),
    certificados: coletarCertificados(alvos.dominios, alvos.traefik, alvos.janelaHoras, rodar, agora),
    bancos: coletarBancos(alvos, rodar, agora),
    logs: coletarLogs(regras, alvos, rodar),
    discoPct: disco,
    memoriaLivreMb: memoria,
  };
}
