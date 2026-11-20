// O vigia das plataformas: cada regra com um caso do tipo que a motivou. Nomes fictícios.
import dados from '../vigia/alvos.exemplo.json';
import { coletarBancos, coletarCertificados, coletarContainers, coletarLogs, semSegredo, type Alvos, type Rodar } from '../vigia/coleta';
import { avaliar, comparar, type Config, type Fatos } from '../vigia/regras';
import { assunto, html, markdown } from '../vigia/relatorio';
import { entradaDoResumo, escreverResumo } from '../vigia/resumo';

const cfg = dados.config as unknown as Config;
const alvos = dados.alvos as unknown as Alvos;
const vazio: Fatos = { containers: [], sites: [], certificados: [], bancos: [], logs: [], discoPct: 50, memoriaLivreMb: 7000 };
const ids = (f: Partial<Fatos>) => avaliar({ ...vazio, ...f }, cfg).map((a) => `${a.gravidade}:${a.id}`);

describe('regras', () => {
  it('máquina saudável não gera achado', () => {
    expect(avaliar(vazio, cfg)).toEqual([]);
  });

  it('origem vencida atrás da Cloudflare é ALTA e agrupada por zona; direta é CRÍTICA', () => {
    expect(ids({ certificados: [
      { dominio: 'exemplo.com.br', diasOrigem: -91, atrasDaCloudflare: true, falhasRenovacao: 7 },
      { dominio: 'api.exemplo.com.br', diasOrigem: -56, atrasDaCloudflare: true, falhasRenovacao: 1 },
      { dominio: 'x.com.br', diasOrigem: -1, atrasDaCloudflare: false, falhasRenovacao: 0 },
      { dominio: 'ok.com.br', diasOrigem: 80, atrasDaCloudflare: false, falhasRenovacao: 0 },
    ] })).toEqual(['critica:cert:x.com.br', 'alta:cert-zona:exemplo.com.br']);
  });

  it('zona do domínio', () => {
    const { zona } = jest.requireActual('../vigia/regras');
    expect(zona('www.exemplo.com.br')).toBe('exemplo.com.br');
    expect(zona('api.painel.loja.com.br')).toBe('loja.com.br');
    expect(zona('id.empresa.com')).toBe('empresa.com');
  });

  it('526 explica que a Cloudflare não validou a origem', () => {
    const [a] = avaliar({ ...vazio, sites: [{ url: 'https://antigo.com.br/', status: 526, segundos: 0.1 }] }, cfg);
    expect(a.gravidade).toBe('critica');
    expect(a.detalhe).toMatch(/certificado da origem/);
  });

  it('banco sem backup e backup velho são críticos; aceito com motivo não aparece', () => {
    const c = { ...cfg, semBackupAceito: { 'cache-db': 'só cache, recriável' } };
    const r = avaliar({ ...vazio, bancos: [
      { container: 'email-db', idadeBackupHoras: null },
      { container: 'analise-postgres', idadeBackupHoras: 24 * 137 },
      { container: 'app-db', idadeBackupHoras: 16 },
      { container: 'cache-db', idadeBackupHoras: null },
    ] }, c).map((a) => a.titulo);
    expect(r).toEqual(['analise-postgres: último backup há 137 dias', 'email-db: banco sem backup']);
  });

  it('runner do CI parado ou reiniciando não é problema; outro container é', () => {
    expect(ids({ containers: [
      { nome: 'ci-runners-app-1', estado: 'restarting', saude: '', reinicios: 19 },
      { nome: 'vendas-api', estado: 'running', saude: 'unhealthy', reinicios: 0 },
      { nome: 'analise-api', estado: 'running', saude: '', reinicios: 4 },
      { nome: 'outro-db', estado: 'parado', saude: '', reinicios: 0 },
    ] })).toEqual(['critica:container:outro-db:estado', 'alta:container:vendas-api:saude',
      'media:container:analise-api:reinicios']);
  });

  it('assinatura de log vira achado com a ação da regra', () => {
    const [a] = avaliar({ ...vazio, logs: [{ container: 'vendas-worker', regra: 'modelo_inexistente', ocorrencias: 3,
      exemplo: 'The model `velho/modelo` does not exist' }] }, cfg);
    expect(a.gravidade).toBe('alta');
    expect(a.acao).toMatch(/registro/);
  });

  it('compara semana contra semana', () => {
    const atuais = avaliar({ ...vazio, discoPct: 90, memoriaLivreMb: 500 }, cfg);
    const c = comparar(atuais, ['recursos:disco', 'backup:velho']);
    expect(c.novos.map((a) => a.id)).toEqual(['recursos:memoria']);
    expect(c.persistentes.map((a) => a.id)).toEqual(['recursos:disco']);
    expect(c.resolvidos).toEqual(['backup:velho']);
  });
});

describe('coleta (comandos simulados)', () => {
  const simular = (respostas: [RegExp, string][]): Rodar => (cmd) => respostas.find(([re]) => re.test(cmd))?.[1] ?? '';

  it('ignora job que terminou bem e marca o resto', () => {
    const r = simular([[/docker ps -a/, 'a|running|Up 2 days (healthy)\nmigrate|exited|Exited (0) 2h ago\nb|exited|Exited (137) 1h ago\n'],
      [/inspect.*a$/, '0'], [/inspect.*b$/, '5']]);
    expect(coletarContainers(r)).toEqual([
      { nome: 'a', estado: 'running', saude: 'healthy', reinicios: 0 },
      { nome: 'b', estado: 'parado', saude: '', reinicios: 5 },
    ]);
  });

  it('certificado: dias até vencer, Cloudflare pelo IP e falhas de renovação pelo log', () => {
    const r = simular([
      [/docker logs/, 'ERR Error renewing ACME certificate: {exemplo.com.br []} ...\nERR Error renewing ACME certificate: {exemplo.com.br []}'],
      [/openssl/, 'notAfter=Aug 21 10:00:00 2026 GMT'],
      [/getent/, '104.21.33.131 STREAM exemplo.com.br'],
    ]);
    const [c] = coletarCertificados(['exemplo.com.br'], 'traefik', 168, r, new Date('2026-11-20T10:00:00Z'));
    expect(c).toEqual({ dominio: 'exemplo.com.br', diasOrigem: -91, atrasDaCloudflare: true, falhasRenovacao: 2 });
  });

  it('banco que ninguém configurou entra como "sem backup"', () => {
    const r = simular([
      [/docker ps --format/, 'app-db|pgvector/pgvector:pg16\nnovo-db|postgres:16\nalgum-redis|redis:7\nweb|nginx\noutro-db|ccc6e83d6e35'],
      [/app-\*/, String(Math.floor(Date.parse('2026-11-20T02:40:00Z') / 1000))],
    ]);
    expect(coletarBancos(alvos, r, new Date('2026-11-20T10:40:00Z'))).toEqual([
      { container: 'app-db', idadeBackupHoras: 8 },
      { container: 'novo-db', idadeBackupHoras: null },
      { container: 'outro-db', idadeBackupHoras: null },   // imagem só com hash: pega pelo nome
    ]);
  });

  it('banco do Swarm casa pelo prefixo do nome', () => {
    const r = simular([
      [/docker ps --format/, 'zap_db.1.abc123|postgres:17'],
      [/zap-\*/, String(Math.floor(Date.parse('2026-11-20T02:40:00Z') / 1000))],
    ]);
    const a = { ...alvos, bancos: { zap_db: 'zap' } };
    expect(coletarBancos(a, r, new Date('2026-11-20T04:40:00Z'))).toEqual([{ container: 'zap_db.1.abc123', idadeBackupHoras: 2 }]);
  });

  it('log: conta por regra e o exemplo sai sem segredo', () => {
    const r = simular([[/docker ps --format/, 'api\nci-runners-x-1'],
      [/logs.*api/, 'ok\nError: credit balance is too low; key sk-ant-api03-abcdefghijklmnopqrst for fulano@ex.com\n']]);
    const [a] = coletarLogs(cfg.regrasDeLog, alvos, r);
    expect(a).toMatchObject({ container: 'api', regra: 'anthropic_sem_credito', ocorrencias: 1 });
    expect(a.exemplo).not.toMatch(/sk-ant|fulano/);
  });

  it('semSegredo esconde chave, token, e-mail e telefone', () => {
    const t = semSegredo('Bearer abc.def gsk_ABCDEFGHIJKLMNOP123 tel 11912345678 a@b.com password=xyz');
    expect(t).not.toMatch(/abc\.def|gsk_ABC|11912345678|a@b\.com|xyz/);
  });
});

describe('relatório e resumo', () => {
  const achados = avaliar({ ...vazio, sites: [{ url: 'https://x/<script>', status: 526, segundos: 0 }] }, cfg);
  const cmp = comparar(achados, []);

  it('HTML escapa e assunto resume', () => {
    expect(html(achados, cmp, '2026-11-23', null)).not.toMatch(/<script>/);
    expect(assunto(achados, cmp)).toBe('Vigia: 1 crítico(s), 0 alto(s), 0 médio(s), 1 novo(s)');
    expect(markdown(achados, cmp, '2026-11-23', 'resumo')).toMatch(/## Resumo/);
  });

  it('sem chave nenhuma: sem resumo, sem erro', async () => {
    const r = await escreverResumo(achados, cmp, {});
    expect(r.texto).toBeNull();
    expect(r.motivo).toMatch(/nenhuma das chaves/);
  });

  it('cascata inteira falhando: sem resumo, o relatório segue', async () => {
    const falha = async () => { throw new Error('credit balance is too low'); };
    const r = await escreverResumo(achados, cmp, { GROQ_API_KEY: 'k' }, falha as never);
    expect(r).toEqual({ texto: null, motivo: expect.stringMatching(/IA indisponível/) });
  });

  it('a instrução proíbe a IA de escrever números', () => {
    const { INSTRUCAO } = jest.requireActual('../vigia/resumo');
    expect(INSTRUCAO).toMatch(/NÃO escreva números/);
  });

  it('resposta vazia vira motivo, não "undefined"', async () => {
    const vazio = async () => ({ text: '  ', modelUsed: 'm' }) as any;
    const r = await escreverResumo(achados, cmp, { GROQ_API_KEY: 'k' }, vazio as never);
    expect(r).toEqual({ texto: null, modelo: 'm', motivo: 'm respondeu vazio' });
  });

  it('a IA recebe só os achados, usa o papel classificacao e devolve o texto', async () => {
    let pedido: any;
    const ok = async (config: any, params: any) => { pedido = { config, params }; return { text: ' Urgente: x. ', modelUsed: 'm' } as any; };
    const r = await escreverResumo(achados, cmp, { GROQ_API_KEY: 'k' }, ok as never);
    expect(r.texto).toBe('Urgente: x.');
    expect(pedido.config.useCase).toBe('vigia_resumo');
    expect(pedido.params.messages[0].content).toBe(entradaDoResumo(achados, cmp));
  });
});
