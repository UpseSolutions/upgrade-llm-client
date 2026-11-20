// O vigia das plataformas: transforma os FATOS da semana (coleta.ts) em ACHADOS com gravidade
// e a ação recomendada. Puro: sem rede, sem disco, sem relógio (o "agora" entra por parâmetro),
// para cada regra ter teste.
//
// Por que existe, além de um monitor de "está de pé?": os problemas que mais custam não derrubam
// container. Exemplos do tipo que ele foi feito para achar:
//   - certificado da ORIGEM vencido, escondido por um proxy de CDN em modo "Full" (o visitante
//     vê cadeado verde; a renovação falha toda noite no log, e o site cai no dia em que a zona
//     passar para "Full (strict)");
//   - banco de dados sem backup, ou com o backup parado há meses;
//   - provedor de IA sem crédito, modelo que deixou de existir, coletor externo bloqueado.
// Nada disso derruba container. Por isso o vigia é semanal e olha FUNCIONAMENTO, não só vida.

export type Gravidade = 'critica' | 'alta' | 'media' | 'info';

export interface Achado {
  /** Estável entre semanas: é por ele que o histórico sabe se é novo, persistente ou resolvido. */
  id: string;
  gravidade: Gravidade;
  area: 'containers' | 'sites' | 'certificados' | 'backups' | 'logs' | 'recursos';
  titulo: string;
  detalhe: string;
  acao: string;
}

export interface Container {
  nome: string;
  estado: string; // running, exited, restarting...
  saude: string; // healthy, unhealthy, '' (sem healthcheck)
  reinicios: number;
}

export interface Site {
  url: string;
  status: number; // 0 = sem resposta
  segundos: number;
}

export interface Certificado {
  dominio: string;
  /** Dias até vencer o certificado servido pela ORIGEM (a própria VPS). Negativo = vencido. */
  diasOrigem: number | null;
  /** O DNS aponta para a Cloudflare (proxy laranja)? */
  atrasDaCloudflare: boolean;
  /** Falhas de renovação do Traefik para o domínio na janela. */
  falhasRenovacao: number;
}

export interface Banco {
  container: string;
  /** Idade em horas do backup mais novo; null = nenhum backup encontrado. */
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
  padrao: string; // regex, sem diferenciar maiúsculas
  gravidade: Gravidade;
  explica: string;
  acao: string;
}

export interface Config {
  /** Containers que param e reiniciam por desenho (runners efêmeros do CI, ligados e desligados
   *  pelo alternar_ci.py conforme a franquia do GitHub): nem parada nem reinício são problema. */
  reinicioEsperado: string[];
  backupMaxHoras: number;
  certificadoMinDias: number;
  discoMaxPct: number;
  memoriaMinMb: number;
  /** Bancos que dispensam backup, com o motivo escrito (vazio = todo banco precisa). */
  semBackupAceito: Record<string, string>;
  regrasDeLog: RegraDeLog[];
}

/** exemplo.com.br para www.exemplo.com.br e api.exemplo.com.br; vale para .com e .com.br. */
export function zona(dominio: string): string {
  const partes = dominio.split('.');
  return partes.slice(/\.(com|net|org|gov|edu)\.br$/.test(dominio) ? -3 : -2).join('.');
}

const casa = (nome: string, padroes: string[]) => padroes.some((p) => new RegExp(p).test(nome));

export function avaliar(f: Fatos, cfg: Config): Achado[] {
  const achados: Achado[] = [];
  const add = (a: Achado) => achados.push(a);

  // ── containers ──
  for (const c of f.containers) {
    if (casa(c.nome, cfg.reinicioEsperado)) continue;
    if (c.estado !== 'running') {
      add({ id: `container:${c.nome}:estado`, gravidade: 'critica', area: 'containers',
        titulo: `${c.nome} está "${c.estado}"`, detalhe: `${c.reinicios} reinício(s) registrados.`,
        acao: 'Ver `docker logs` do container: reinício em laço costuma ser variável de ambiente ou banco fora.' });
    } else if (c.saude === 'unhealthy') {
      add({ id: `container:${c.nome}:saude`, gravidade: 'alta', area: 'containers',
        titulo: `${c.nome} rodando, mas "unhealthy"`, detalhe: 'O healthcheck do próprio container está falhando.',
        acao: 'Ver `docker inspect --format "{{json .State.Health}}"` para a saída do healthcheck.' });
    } else if (c.reinicios >= 3) {
      add({ id: `container:${c.nome}:reinicios`, gravidade: 'media', area: 'containers',
        titulo: `${c.nome} reiniciou ${c.reinicios} vezes`, detalhe: 'Está de pé agora, mas caiu e voltou.',
        acao: 'Procurar o motivo da queda nos logs (falta de memória aparece como OOMKilled no `docker inspect`).' });
    }
  }

  // ── sites ──
  for (const s of f.sites) {
    if (s.status === 0 || s.status >= 500) {
      const cf = s.status >= 520 && s.status <= 527;
      add({ id: `site:${s.url}`, gravidade: 'critica', area: 'sites',
        titulo: `${s.url} fora do ar (${s.status || 'sem resposta'})`,
        detalhe: cf ? `HTTP ${s.status} vem da Cloudflare: ela não conseguiu falar com a origem (526 = certificado da origem inválido).`
                    : 'O endereço não respondeu ou respondeu com erro de servidor.',
        acao: cf ? 'Conferir o certificado da origem (ver achados de certificado) e o modo SSL da zona na Cloudflare.'
                 : 'Ver o container do serviço e o log do Traefik.' });
    } else if (s.status >= 400) {
      add({ id: `site:${s.url}`, gravidade: 'alta', area: 'sites', titulo: `${s.url} responde ${s.status}`,
        detalhe: 'O endereço de saúde configurado deveria responder 2xx/3xx.',
        acao: 'Conferir se a rota de saúde mudou ou se o serviço perdeu a configuração.' });
    } else if (s.segundos > 5) {
      add({ id: `site:${s.url}:lento`, gravidade: 'media', area: 'sites',
        titulo: `${s.url} lento (${s.segundos.toFixed(1)} s)`, detalhe: 'Respondeu, mas acima de 5 s.',
        acao: 'Ver CPU/memória do container e consultas lentas no banco.' });
    }
  }

  // ── certificados ──
  // Origem vencida atrás da Cloudflare: um achado por ZONA (exemplo.com.br cobre www e api),
  // porque a causa e a correção são uma só por zona. Os outros casos seguem por domínio.
  const mascarados = new Map<string, Certificado[]>();
  for (const c of f.certificados) {
    if (c.diasOrigem === null) continue;
    if (c.diasOrigem < 0 && c.atrasDaCloudflare) {
      const z = zona(c.dominio);
      mascarados.set(z, [...(mascarados.get(z) ?? []), c]);
    } else if (c.diasOrigem < 0) {
      add({ id: `cert:${c.dominio}`, gravidade: 'critica', area: 'certificados',
        titulo: `${c.dominio}: certificado vencido há ${-c.diasOrigem} dias`,
        detalhe: 'O DNS aponta direto para a VPS: o navegador mostra erro de segurança.',
        acao: 'Ver o erro de renovação no log do Traefik (`docker logs traefik... | grep acme`).' });
    } else if (c.diasOrigem < cfg.certificadoMinDias) {
      add({ id: `cert:${c.dominio}`, gravidade: c.falhasRenovacao > 0 ? 'alta' : 'media', area: 'certificados',
        titulo: `${c.dominio}: certificado vence em ${c.diasOrigem} dias`,
        detalhe: c.falhasRenovacao > 0 ? `E a renovação está falhando (${c.falhasRenovacao}x).`
                                       : 'O Traefik renova a 30 dias do fim; se passou disso, a renovação não está acontecendo.',
        acao: 'Ver o log do Traefik para o domínio.' });
    }
  }
  for (const [z, lista] of mascarados) {
    const pior = Math.max(...lista.map((c) => -(c.diasOrigem as number)));
    add({ id: `cert-zona:${z}`, gravidade: 'alta', area: 'certificados',
      titulo: `${z}: certificado da origem vencido há até ${pior} dias (${lista.length} endereço(s))`,
      detalhe: `${lista.map((c) => c.dominio).join(', ')}. O visitante não vê (a Cloudflare põe o certificado dela), ` +
        'mas a ligação Cloudflare → VPS não é verificada, e se a zona passar para "Full (strict)" o site cai com 526. ' +
        `${lista.reduce((n, c) => n + c.falhasRenovacao, 0)} falha(s) de renovação no Traefik.`,
      acao: 'O desafio TLS-ALPN do Traefik não passa pelo proxy da Cloudflare. Trocar para desafio DNS ' +
        '(dnsChallenge com o provedor cloudflare) ou instalar um certificado de origem da Cloudflare (15 anos).' });
  }

  // ── backups ──
  for (const b of f.bancos) {
    if (cfg.semBackupAceito[b.container]) continue;
    if (b.idadeBackupHoras === null) {
      add({ id: `backup:${b.container}`, gravidade: 'critica', area: 'backups',
        titulo: `${b.container}: banco sem backup`,
        detalhe: 'Nenhuma cópia encontrada. Perder o disco da VPS = perder estes dados.',
        acao: 'Incluir o banco no script de backup (dump diário + cópia fora da máquina), ou registrar em ' +
          '`semBackupAceito` o motivo de não precisar.' });
    } else if (b.idadeBackupHoras > cfg.backupMaxHoras) {
      add({ id: `backup:${b.container}`, gravidade: 'critica', area: 'backups',
        titulo: `${b.container}: último backup há ${Math.round(b.idadeBackupHoras / 24)} dias`,
        detalhe: `O limite é ${cfg.backupMaxHoras} h. O backup parou de rodar.`,
        acao: 'Ver o log e o agendamento do script de backup.' });
    }
  }

  // ── assinaturas de erro nos logs ──
  const porNome = new Map(cfg.regrasDeLog.map((r) => [r.nome, r]));
  for (const a of f.logs) {
    const r = porNome.get(a.regra);
    if (!r || a.ocorrencias === 0) continue;
    add({ id: `log:${a.container}:${a.regra}`, gravidade: r.gravidade, area: 'logs',
      titulo: `${a.container}: ${r.explica} (${a.ocorrencias}x na semana)`,
      detalhe: `Exemplo: ${a.exemplo.slice(0, 220)}`, acao: r.acao });
  }

  // ── recursos ──
  if (f.discoPct >= cfg.discoMaxPct) {
    add({ id: 'recursos:disco', gravidade: f.discoPct >= 95 ? 'critica' : 'alta', area: 'recursos',
      titulo: `Disco em ${f.discoPct}%`, detalhe: 'Disco cheio derruba banco e para backup.',
      acao: '`docker system df` e `docker image prune`; conferir o expurgo dos backups.' });
  }
  if (f.memoriaLivreMb < cfg.memoriaMinMb) {
    add({ id: 'recursos:memoria', gravidade: 'alta', area: 'recursos',
      titulo: `Memória disponível baixa (${f.memoriaLivreMb} MB)`, detalhe: 'Risco de o kernel matar processos (OOM).',
      acao: '`docker stats --no-stream` para achar o container que mais consome.' });
  }

  const ordem: Record<Gravidade, number> = { critica: 0, alta: 1, media: 2, info: 3 };
  return achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || a.id.localeCompare(b.id));
}

export interface Comparacao {
  novos: Achado[];
  persistentes: Achado[];
  resolvidos: string[]; // ids da semana passada que sumiram
}

/** Semana contra semana: o que apareceu, o que continua e o que foi resolvido. */
export function comparar(atuais: Achado[], idsAnteriores: string[]): Comparacao {
  const antes = new Set(idsAnteriores);
  const agora = new Set(atuais.map((a) => a.id));
  return {
    novos: atuais.filter((a) => !antes.has(a.id)),
    persistentes: atuais.filter((a) => antes.has(a.id)),
    resolvidos: idsAnteriores.filter((id) => !agora.has(id)),
  };
}
