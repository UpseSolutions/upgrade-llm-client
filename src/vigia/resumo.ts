// O resumo do relatório escrito por IA, pela cascata da própria lib (o "vínculo" do vigia com o
// gateway de LLM). Papel `classificacao`: barato, e a tarefa é curta.
//
// Regras:
//   - a IA só ESCREVE: gravidade, ordem e ação vêm das regras (regras.ts), testadas;
//   - recebe só os achados (já sem segredo, ver coleta.semSegredo) — nunca log cru;
//   - sem chave nenhuma, ou com toda a cascata falhando, o relatório sai sem resumo. O vigia
//     nunca deixa de avisar por causa da IA: é justamente quando o crédito acaba que ele precisa
//     mais funcionar (crédito acabando é um dos achados que ele existe para dar).

import { completeWithFallback } from '../fallback/cascade';
import { passosDoPapel } from '../models/registry';
import type { Achado, Comparacao } from './regras';

// Medido no 1º relatório (20/11/2026): o modelo do papel (gpt-oss-20b) errava contas — "13 bancos"
// eram 12, "9 domínios" eram 4 zonas, "5 contas" eram 2. Decisão: a IA não escreve número nenhum;
// os números vêm das regras, no corpo do relatório, logo abaixo do resumo.
export const INSTRUCAO =
  'Você escreve o resumo de um relatório técnico semanal para o dono de uma pequena empresa de software, ' +
  'em português do Brasil. Use SÓ os achados recebidos: não invente causa, número nem produto. ' +
  'NÃO escreva números nem quantidades (eles já estão no relatório, logo abaixo do resumo). ' +
  'Em no máximo 6 linhas: o que é mais urgente e por quê (em linguagem de negócio, sem jargão), ' +
  'o que é novo nesta semana e o que pode esperar. Não repita a lista inteira. Sem markdown.';

export function entradaDoResumo(achados: Achado[], cmp: Comparacao): string {
  const novos = new Set(cmp.novos.map((a) => a.id));
  const linhas = achados.slice(0, 30).map((a) =>
    `- [${a.gravidade}${novos.has(a.id) ? ', novo' : ''}] ${a.titulo}. Ação: ${a.acao}`);
  return `Achados desta semana (${achados.length}):\n${linhas.join('\n')}\n` +
    `Resolvidos desde a semana passada: ${cmp.resolvidos.length ? cmp.resolvidos.join(', ') : 'nenhum'}.`;
}

export async function escreverResumo(
  achados: Achado[],
  cmp: Comparacao,
  chaves: Record<string, string | undefined>,
  chamar: typeof completeWithFallback = completeWithFallback,
): Promise<{ texto: string | null; modelo?: string; motivo?: string }> {
  if (!achados.length) return { texto: null, motivo: 'sem achados' };
  let passos;
  try {
    passos = passosDoPapel('classificacao', undefined, chaves);
  } catch (e) {
    return { texto: null, motivo: (e as Error).message };
  }
  try {
    const r = await chamar(
      { useCase: 'vigia_resumo', steps: passos },
      { system: INSTRUCAO, messages: [{ role: 'user', content: entradaDoResumo(achados, cmp) }],
        // 1.500 e não 400: o gpt-oss do Groq raciocina antes de responder, e com 400 o
        // raciocínio gastava tudo e o texto vinha vazio (medido no 1º relatório, 20/11/2026).
        maxTokens: 1500, temperature: 0.2, feature: 'vigia_resumo' },
    );
    const texto = r.text.trim();
    return texto ? { texto, modelo: r.modelUsed } : { texto: null, modelo: r.modelUsed, motivo: `${r.modelUsed} respondeu vazio` };
  } catch (e) {
    return { texto: null, motivo: `IA indisponível: ${(e as Error).message.slice(0, 160)}` };
  }
}
