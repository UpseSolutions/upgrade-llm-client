import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

/**
 * O subcaminho `@upgrade/llm-client/registro` não pode arrastar SDK de
 * provedor.
 *
 * É o motivo inteiro de ele existir. Um produto como o EmailSeller faz
 * streaming direto na Anthropic e tem reporter próprio: ele se beneficia de
 * LER o registro, mas carregar `@anthropic-ai/sdk`, `openai` e `groq-sdk` para
 * resolver uma string não se paga. Sem o subcaminho, a alternativa era manter o
 * id cravado no produto — o problema que o registro existe para acabar.
 *
 * A regressão aqui é silenciosa: basta alguém acrescentar um import de VALOR em
 * registry.ts ou carregar.ts e o subcaminho passa a puxar mais de cem módulos,
 * sem nada quebrar. Daí este teste medir o grafo real, num processo separado,
 * em vez de inspecionar o fonte.
 */

const raiz = join(__dirname, '..', '..');
const dist = join(raiz, 'dist');

const contarSdks = (entrada: string): number => {
  // Sem regex de propósito: o padrão viajaria por três camadas de string (esta
  // aqui, o argumento de linha de comando e o `-e` do processo filho), e uma
  // barra invertida a mais ou a menos faz o teste passar sempre — medindo zero
  // por não casar com nada. `includes` não tem esse problema.
  const sonda = [
    `require(${JSON.stringify(entrada)});`,
    'const chaves = Object.keys(require.cache);',
    "const sdk = (k) => k.includes('node_modules') && (",
    "  k.includes('@anthropic-ai') || k.includes('openai') || k.includes('groq-sdk'));",
    'console.log(chaves.filter(sdk).length);',
  ].join('');

  return Number(execFileSync(process.execPath, ['-e', sonda], { encoding: 'utf8' }).trim());
};

// O build é pré-requisito: sem dist, não há grafo real para medir. Falhar com
// esta mensagem é melhor que passar sem ter verificado nada.
const compilado = existsSync(join(dist, 'registro.js'));

describe('o subcaminho do registro', () => {
  it('está compilado (rode `npm run build` antes)', () => {
    expect(compilado).toBe(true);
  });

  it('não carrega nenhum SDK de provedor', () => {
    expect(contarSdks(join(dist, 'registro.js'))).toBe(0);
  });

  it('e a raiz carrega, o que confirma que a medição vale algo', () => {
    // Sem esta contraprova, um erro na regex faria o teste acima passar sempre.
    expect(contarSdks(join(dist, 'index.js'))).toBeGreaterThan(10);
  });
});

describe('o pacote declara os dois pontos de entrada', () => {
  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));

  it('exports cobre a raiz e o registro', () => {
    // Declarar `exports` fecha o pacote: subcaminho não declarado deixa de
    // resolver. A raiz TEM de continuar lá, senão os quatro produtos que fazem
    // `require('@upgrade/llm-client')` param de resolver de uma vez.
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['./registro']).toBeDefined();
  });

  it('mantém main e types, para resolvedores clássicos', () => {
    // `moduleResolution: node` ignora `exports` por completo. Os quatro
    // consumidores estão em configurações diferentes, e um subcaminho que só
    // funciona na metade deles seria pior que não existir.
    expect(pkg.main).toBe('dist/index.js');
    expect(pkg.types).toBe('dist/index.d.ts');
  });

  it('e o diretório-stub, que é o que faz o subcaminho resolver no clássico', () => {
    const stub = JSON.parse(readFileSync(join(raiz, 'registro', 'package.json'), 'utf8'));
    expect(stub.main).toBe('../dist/registro.js');
    expect(stub.types).toBe('../dist/registro.d.ts');
    expect(pkg.files).toContain('registro');
  });
});
