"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zona = zona;
exports.avaliar = avaliar;
exports.comparar = comparar;
function zona(dominio) {
    const partes = dominio.split('.');
    return partes.slice(/\.(com|net|org|gov|edu)\.br$/.test(dominio) ? -3 : -2).join('.');
}
const casa = (nome, padroes) => padroes.some((p) => new RegExp(p).test(nome));
function avaliar(f, cfg) {
    const achados = [];
    const add = (a) => achados.push(a);
    for (const c of f.containers) {
        if (casa(c.nome, cfg.reinicioEsperado))
            continue;
        if (c.estado !== 'running') {
            add({ id: `container:${c.nome}:estado`, gravidade: 'critica', area: 'containers',
                titulo: `${c.nome} está "${c.estado}"`, detalhe: `${c.reinicios} reinício(s) registrados.`,
                acao: 'Ver `docker logs` do container: reinício em laço costuma ser variável de ambiente ou banco fora.' });
        }
        else if (c.saude === 'unhealthy') {
            add({ id: `container:${c.nome}:saude`, gravidade: 'alta', area: 'containers',
                titulo: `${c.nome} rodando, mas "unhealthy"`, detalhe: 'O healthcheck do próprio container está falhando.',
                acao: 'Ver `docker inspect --format "{{json .State.Health}}"` para a saída do healthcheck.' });
        }
        else if (c.reinicios >= 3) {
            add({ id: `container:${c.nome}:reinicios`, gravidade: 'media', area: 'containers',
                titulo: `${c.nome} reiniciou ${c.reinicios} vezes`, detalhe: 'Está de pé agora, mas caiu e voltou.',
                acao: 'Procurar o motivo da queda nos logs (falta de memória aparece como OOMKilled no `docker inspect`).' });
        }
    }
    for (const s of f.sites) {
        if (s.status === 0 || s.status >= 500) {
            const cf = s.status >= 520 && s.status <= 527;
            add({ id: `site:${s.url}`, gravidade: 'critica', area: 'sites',
                titulo: `${s.url} fora do ar (${s.status || 'sem resposta'})`,
                detalhe: cf ? `HTTP ${s.status} vem da Cloudflare: ela não conseguiu falar com a origem (526 = certificado da origem inválido).`
                    : 'O endereço não respondeu ou respondeu com erro de servidor.',
                acao: cf ? 'Conferir o certificado da origem (ver achados de certificado) e o modo SSL da zona na Cloudflare.'
                    : 'Ver o container do serviço e o log do Traefik.' });
        }
        else if (s.status >= 400) {
            add({ id: `site:${s.url}`, gravidade: 'alta', area: 'sites', titulo: `${s.url} responde ${s.status}`,
                detalhe: 'O endereço de saúde configurado deveria responder 2xx/3xx.',
                acao: 'Conferir se a rota de saúde mudou ou se o serviço perdeu a configuração.' });
        }
        else if (s.segundos > 5) {
            add({ id: `site:${s.url}:lento`, gravidade: 'media', area: 'sites',
                titulo: `${s.url} lento (${s.segundos.toFixed(1)} s)`, detalhe: 'Respondeu, mas acima de 5 s.',
                acao: 'Ver CPU/memória do container e consultas lentas no banco.' });
        }
    }
    const mascarados = new Map();
    for (const c of f.certificados) {
        if (c.diasOrigem === null)
            continue;
        if (c.diasOrigem < 0 && c.atrasDaCloudflare) {
            const z = zona(c.dominio);
            mascarados.set(z, [...(mascarados.get(z) ?? []), c]);
        }
        else if (c.diasOrigem < 0) {
            add({ id: `cert:${c.dominio}`, gravidade: 'critica', area: 'certificados',
                titulo: `${c.dominio}: certificado vencido há ${-c.diasOrigem} dias`,
                detalhe: 'O DNS aponta direto para a VPS: o navegador mostra erro de segurança.',
                acao: 'Ver o erro de renovação no log do Traefik (`docker logs traefik... | grep acme`).' });
        }
        else if (c.diasOrigem < cfg.certificadoMinDias) {
            add({ id: `cert:${c.dominio}`, gravidade: c.falhasRenovacao > 0 ? 'alta' : 'media', area: 'certificados',
                titulo: `${c.dominio}: certificado vence em ${c.diasOrigem} dias`,
                detalhe: c.falhasRenovacao > 0 ? `E a renovação está falhando (${c.falhasRenovacao}x).`
                    : 'O Traefik renova a 30 dias do fim; se passou disso, a renovação não está acontecendo.',
                acao: 'Ver o log do Traefik para o domínio.' });
        }
    }
    for (const [z, lista] of mascarados) {
        const pior = Math.max(...lista.map((c) => -c.diasOrigem));
        add({ id: `cert-zona:${z}`, gravidade: 'alta', area: 'certificados',
            titulo: `${z}: certificado da origem vencido há até ${pior} dias (${lista.length} endereço(s))`,
            detalhe: `${lista.map((c) => c.dominio).join(', ')}. O visitante não vê (a Cloudflare põe o certificado dela), ` +
                'mas a ligação Cloudflare → VPS não é verificada, e se a zona passar para "Full (strict)" o site cai com 526. ' +
                `${lista.reduce((n, c) => n + c.falhasRenovacao, 0)} falha(s) de renovação no Traefik.`,
            acao: 'O desafio TLS-ALPN do Traefik não passa pelo proxy da Cloudflare. Trocar para desafio DNS ' +
                '(dnsChallenge com o provedor cloudflare) ou instalar um certificado de origem da Cloudflare (15 anos).' });
    }
    for (const b of f.bancos) {
        if (cfg.semBackupAceito[b.container])
            continue;
        if (b.idadeBackupHoras === null) {
            add({ id: `backup:${b.container}`, gravidade: 'critica', area: 'backups',
                titulo: `${b.container}: banco sem backup`,
                detalhe: 'Nenhuma cópia encontrada. Perder o disco da VPS = perder estes dados.',
                acao: 'Incluir o banco no script de backup (dump diário + cópia fora da máquina), ou registrar em ' +
                    '`semBackupAceito` o motivo de não precisar.' });
        }
        else if (b.idadeBackupHoras > cfg.backupMaxHoras) {
            add({ id: `backup:${b.container}`, gravidade: 'critica', area: 'backups',
                titulo: `${b.container}: último backup há ${Math.round(b.idadeBackupHoras / 24)} dias`,
                detalhe: `O limite é ${cfg.backupMaxHoras} h. O backup parou de rodar.`,
                acao: 'Ver o log e o agendamento do script de backup.' });
        }
    }
    const porNome = new Map(cfg.regrasDeLog.map((r) => [r.nome, r]));
    for (const a of f.logs) {
        const r = porNome.get(a.regra);
        if (!r || a.ocorrencias === 0)
            continue;
        add({ id: `log:${a.container}:${a.regra}`, gravidade: r.gravidade, area: 'logs',
            titulo: `${a.container}: ${r.explica} (${a.ocorrencias}x na semana)`,
            detalhe: `Exemplo: ${a.exemplo.slice(0, 220)}`, acao: r.acao });
    }
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
    const ordem = { critica: 0, alta: 1, media: 2, info: 3 };
    return achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || a.id.localeCompare(b.id));
}
function comparar(atuais, idsAnteriores) {
    const antes = new Set(idsAnteriores);
    const agora = new Set(atuais.map((a) => a.id));
    return {
        novos: atuais.filter((a) => !antes.has(a.id)),
        persistentes: atuais.filter((a) => antes.has(a.id)),
        resolvidos: idsAnteriores.filter((id) => !agora.has(id)),
    };
}
//# sourceMappingURL=regras.js.map