"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contagem = contagem;
exports.assunto = assunto;
exports.markdown = markdown;
exports.html = html;
const ROTULO = { critica: 'Crítico', alta: 'Alto', media: 'Médio', info: 'Info' };
const COR = { critica: '#b91c1c', alta: '#c2410c', media: '#a16207', info: '#475569' };
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function contagem(achados) {
    const c = { critica: 0, alta: 0, media: 0, info: 0 };
    for (const a of achados)
        c[a.gravidade]++;
    return c;
}
function assunto(achados, cmp) {
    const c = contagem(achados);
    if (!achados.length)
        return 'Vigia: tudo certo nas plataformas';
    const novos = cmp.novos.length ? `, ${cmp.novos.length} novo(s)` : '';
    return `Vigia: ${c.critica} crítico(s), ${c.alta} alto(s), ${c.media} médio(s)${novos}`;
}
function markdown(achados, cmp, dia, resumo) {
    const novos = new Set(cmp.novos.map((a) => a.id));
    const linhas = [`# Vigia das plataformas · ${dia}`, ''];
    if (resumo)
        linhas.push('## Resumo', '', resumo, '');
    const c = contagem(achados);
    linhas.push(`**${achados.length} achado(s):** ${c.critica} crítico, ${c.alta} alto, ${c.media} médio. ` +
        `${cmp.novos.length} novo(s) desde a semana passada, ${cmp.resolvidos.length} resolvido(s).`, '');
    for (const a of achados) {
        linhas.push(`### [${ROTULO[a.gravidade]}]${novos.has(a.id) ? ' 🆕' : ''} ${a.titulo}`, '', a.detalhe, '', `**O que fazer:** ${a.acao}`, '');
    }
    if (cmp.resolvidos.length)
        linhas.push('## Resolvidos desde a semana passada', '', ...cmp.resolvidos.map((r) => `- ${r}`), '');
    return linhas.join('\n');
}
function html(achados, cmp, dia, resumo) {
    const novos = new Set(cmp.novos.map((a) => a.id));
    const c = contagem(achados);
    const cartao = (n, rotulo, cor) => `<td style="padding:10px;text-align:center;border:1px solid #e2e8f0;border-radius:8px;background:#fff">` +
        `<div style="font-size:22px;font-weight:700;color:${cor}">${n}</div><div style="font-size:12px;color:#64748b">${rotulo}</div></td>`;
    const itens = achados.map((a) => `<tr><td style="padding:12px 14px;border-top:1px solid #e2e8f0;border-left:4px solid ${COR[a.gravidade]}">` +
        `<div style="font-size:12px;font-weight:700;color:${COR[a.gravidade]}">${ROTULO[a.gravidade].toUpperCase()}` +
        `${novos.has(a.id) ? ' · NOVO' : ''} · ${esc(a.area)}</div>` +
        `<div style="font-size:15px;font-weight:600;color:#0f172a;margin-top:2px">${esc(a.titulo)}</div>` +
        `<div style="font-size:13px;color:#475569;margin-top:4px">${esc(a.detalhe)}</div>` +
        `<div style="font-size:13px;color:#0f172a;margin-top:6px"><strong>O que fazer:</strong> ${esc(a.acao)}</div></td></tr>`).join('');
    const resolvidos = cmp.resolvidos.length
        ? `<p style="font-size:13px;color:#15803d"><strong>Resolvidos desde a semana passada:</strong> ${esc(cmp.resolvidos.join(', '))}</p>` : '';
    return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
<tr><td style="background:#0f172a;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
<div style="font-size:12px;color:#94a3b8;letter-spacing:1px">VIGIA DAS PLATAFORMAS · UPGRADE</div>
<div style="font-size:19px;font-weight:700;margin-top:4px">Verificação semanal · ${esc(dia)}</div></td></tr>
<tr><td style="background:#fff;padding:14px"><table role="presentation" width="100%" cellspacing="8"><tr>
${cartao(c.critica, 'críticos', '#b91c1c')}${cartao(c.alta, 'altos', '#c2410c')}${cartao(c.media, 'médios', '#a16207')}${cartao(cmp.novos.length, 'novos', '#0f172a')}
</tr></table>${resumo ? `<div style="font-size:14px;color:#0f172a;line-height:1.5;padding:4px 6px 10px;white-space:pre-wrap">${esc(resumo)}</div>` : ''}</td></tr>
<tr><td style="background:#fff;border-radius:0 0 12px 12px"><table role="presentation" width="100%" cellspacing="0">${itens ||
        '<tr><td style="padding:20px;color:#15803d">Nenhum problema encontrado.</td></tr>'}</table></td></tr>
<tr><td style="padding:12px 6px;font-size:12px;color:#64748b">${resolvidos}Regras e configuração: upgrade-llm-client/src/vigia.
O resumo é escrito por IA a partir dos achados; a gravidade vem das regras, nunca da IA.</td></tr>
</table></td></tr></table></body></html>`;
}
//# sourceMappingURL=relatorio.js.map