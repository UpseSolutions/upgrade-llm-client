import { join, relative, sep } from 'node:path';
import { readdirSync, readFileSync, statSync } from 'node:fs';

/**
 * Guardiões de duas regras que antes só existiam em texto.
 *
 * 1. A lib nunca lê env var: tudo entra por parâmetro, e quem instancia decide de
 *    onde vêm as chaves. Só os CLIs (programas que rodam sozinhos, como o vigia)
 *    podem ler `process.env`. Uma leitura escondida na lib faria uma versão nova
 *    ligar comportamento em produto que nunca pediu, só por ter a variável.
 * 2. O repositório é público: o inventário real do vigia fica fora do git.
 */

const raiz = join(__dirname, '..', '..');
const src = join(raiz, 'src');

const arquivosTs = (pasta: string): string[] =>
  readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivosTs(caminho);
    return caminho.endsWith('.ts') ? [caminho] : [];
  });

// Comentário não lê nada: `registry.ts` explica no JSDoc que quem chama passa `process.env`.
const ehComentario = (linha: string): boolean => /^\s*(\/\/|\/\*|\*)/.test(linha);

export const leiturasDeEnv = (arquivos: { caminho: string; texto: string }[]): string[] =>
  arquivos
    .filter(({ caminho }) => !caminho.endsWith(`${sep}cli.ts`) && !caminho.endsWith('/cli.ts'))
    .flatMap(({ caminho, texto }) =>
      texto
        .split('\n')
        .map((linha, i) => ({ linha, n: i + 1 }))
        .filter(({ linha }) => linha.includes('process.env') && !ehComentario(linha))
        .map(({ n }) => `${caminho}:${n}`),
    );

describe('a lib nunca lê env var', () => {
  it('fora dos cli.ts, nenhum arquivo de src/ lê process.env', () => {
    const arquivos = arquivosTs(src).map((caminho) => ({
      caminho: relative(raiz, caminho),
      texto: readFileSync(caminho, 'utf8'),
    }));
    expect(leiturasDeEnv(arquivos)).toEqual([]);
  });

  it('e o guardião acusa uma leitura de verdade (contraprova)', () => {
    const achados = leiturasDeEnv([
      { caminho: 'src/core/reserva.ts', texto: "const k = process.env.ANTHROPIC_API_KEY_BACKUP;" },
      { caminho: 'src/models/registry.ts', texto: ' * quem chama passa `process.env`' },
      { caminho: 'src/vigia/cli.ts', texto: 'const p = process.env.VIGIA_PASTA;' },
    ]);
    expect(achados).toEqual(['src/core/reserva.ts:1']);
  });
});

describe('repositório público', () => {
  it('o inventário real do vigia está no .gitignore', () => {
    const linhas = readFileSync(join(raiz, '.gitignore'), 'utf8').split(/\r?\n/);
    expect(linhas).toContain('src/vigia/alvos.json');
  });
});
