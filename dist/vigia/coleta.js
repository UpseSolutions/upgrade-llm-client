"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.semSegredo = semSegredo;
exports.coletarContainers = coletarContainers;
exports.coletarSites = coletarSites;
exports.coletarCertificados = coletarCertificados;
exports.coletarBancos = coletarBancos;
exports.coletarLogs = coletarLogs;
exports.coletar = coletar;
const IPS_CLOUDFLARE = /^(104\.(1[6-9]|2[0-9]|3[01])\.|172\.(6[4-9]|7[01])\.|188\.114\.|162\.15[89]\.|141\.101\.|108\.162\.|190\.93\.|197\.234\.|198\.41\.|173\.245\.|103\.(21|22|31)\.)/;
function semSegredo(texto) {
    return texto
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/(sk|gsk|xai|AC|SK)[-_][A-Za-z0-9_-]{12,}/g, '[CHAVE]')
        .replace(/(Bearer|token|apikey|api_key|password|senha)["'=: ]+[^\s"',}]+/gi, '$1 [OCULTO]')
        .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[E-MAIL]')
        .replace(/org_[A-Za-z0-9]+/g, 'org_[OCULTO]')
        .replace(/\b\d{10,13}\b/g, '[NÚMERO]')
        .slice(0, 300);
}
function coletarContainers(rodar) {
    const linhas = rodar(`docker ps -a --format '{{.Names}}|{{.State}}|{{.Status}}'`).trim().split('\n').filter(Boolean);
    return linhas.flatMap((l) => {
        const [nome, estado, status] = l.split('|');
        if (estado === 'exited' && /Exited \(0\)/.test(status))
            return [];
        const reinicios = Number(rodar(`docker inspect -f '{{.RestartCount}}' ${nome}`).trim()) || 0;
        const saude = /\(unhealthy\)/.test(status) ? 'unhealthy' : /\(healthy\)/.test(status) ? 'healthy' : '';
        return [{ nome, estado: estado === 'exited' ? 'parado' : estado, saude, reinicios }];
    });
}
async function coletarSites(urls, buscar) {
    const out = [];
    for (const url of urls) {
        try {
            out.push({ url, ...(await buscar(url)) });
        }
        catch {
            out.push({ url, status: 0, segundos: 0 });
        }
    }
    return out;
}
function coletarCertificados(dominios, traefik, janelaHoras, rodar, agora) {
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
function coletarBancos(alvos, rodar, agora) {
    const imagens = rodar(`docker ps --format '{{.Names}}|{{.Image}}'`).trim().split('\n').filter(Boolean);
    const bancos = imagens.filter((l) => /postgres|pgvector|mariadb|mysql|mongo/i.test(l) || /(^|[-_])db([-_.|]|$)/i.test(l.split('|')[0]))
        .map((l) => l.split('|')[0])
        .filter((nome) => !/redis/i.test(nome));
    const prefixoDe = (nome) => Object.entries(alvos.bancos).find(([k]) => nome === k || nome.startsWith(`${k}.`))?.[1] ?? null;
    return [...new Set(bancos)].map((container) => {
        const prefixo = prefixoDe(container);
        if (!prefixo)
            return { container, idadeBackupHoras: null };
        const epoch = rodar(`ls -1t ${alvos.pastaBackups}/${prefixo}-*.gz 2>/dev/null | head -1 | xargs -r stat -c %Y`).trim();
        return { container, idadeBackupHoras: epoch ? Math.round((+agora / 1000 - Number(epoch)) / 3600) : null };
    });
}
function coletarLogs(regras, alvos, rodar) {
    const nomes = rodar(`docker ps --format '{{.Names}}'`).trim().split('\n').filter(Boolean)
        .filter((n) => !alvos.ignorarLogs.some((p) => new RegExp(p).test(n)));
    const out = [];
    for (const nome of nomes) {
        const log = rodar(`docker logs --since ${alvos.janelaHoras}h ${nome} 2>&1 | tail -n 20000`, 60_000);
        for (const r of regras) {
            const re = new RegExp(r.padrao, 'i');
            const linhas = log.split('\n').filter((l) => re.test(l));
            if (linhas.length)
                out.push({ container: nome, regra: r.nome, ocorrencias: linhas.length, exemplo: semSegredo(linhas[linhas.length - 1]) });
        }
    }
    return out;
}
async function coletar(alvos, regras, rodar, buscar, agora) {
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
//# sourceMappingURL=coleta.js.map