import { Provider, ProviderId, ProviderSpec, Product } from '../core/types';
import compilado from './models.json';
import { registroAtual } from './carregar';

// Acesso tipado ao registro central (src/models/models.json — leia o `_leiaMe`
// de lá antes de mexer).
//
// A lib continua sem ler env var: o registro devolve QUAL modelo, de QUAL
// provedor e por QUAL URL — nunca a chave. Quem chama segue decidindo de onde
// vêm as chaves. `envKeyOf` devolve o NOME da variável, não o valor.

// O TIPO vem da cópia compilada; os DADOS vêm de registroAtual(), que pode ser
// uma edição mais nova buscada no coletor. É a divisão certa: o compilador só
// pode conhecer o que estava no pacote na hora do build, enquanto o registro em
// uso pode ter papéis acrescentados depois. Papel novo que ainda não existe no
// pacote é alcançável por string; papel REMOVIDO no coletor é recusado na
// carga, para não derrubar quem já o usa.
export type Role = keyof typeof compilado.roles;

export interface ResolvedModel {
  model: string;
  provider: ProviderId;
  /** Pronto para ir direto no CompleteParams — traz a baseUrl do provedor. */
  providerSpec: ProviderSpec;
}

export interface CatalogEntry {
  model: string;
  provider: string;
  measuredEngine: boolean;
}

type ProviderRecord = {
  api?: string;
  baseUrl?: string;
  sdk?: string;
  envKey: string;
  verified: boolean;
};

type ModelRecord = { provider: string; measuredEngine?: boolean };

const providers = () => registroAtual().providers as unknown as Record<string, ProviderRecord>;
const models = () => registroAtual().models as unknown as Record<string, ModelRecord>;

function providerOf(id: string): ProviderRecord {
  const found = providers()[id];
  if (!found) {
    throw new Error(`Provedor "${id}" não existe no registro (src/models/models.json)`);
  }
  return found;
}

function modelOf(id: string): ModelRecord {
  const found = models()[id];
  if (!found) {
    throw new Error(`Modelo "${id}" não existe no registro (src/models/models.json)`);
  }
  return found;
}

function cascadeOf(role: Role, product?: Product): string[] {
  const override = product
    ? (registroAtual().products as Record<string, { roles?: Record<string, { cascade: string[]; reason?: string }> }>)[
        product
      ]?.roles?.[role]
    : undefined;

  if (override && !override.reason) {
    throw new Error(
      `Override de "${role}" em ${product} não tem \`reason\`. ` +
        'Toda divergência entre produtos precisa de razão escrita — sem ela, use o default.',
    );
  }

  const definicao = registroAtual().roles[role as string];
  if (!override && !definicao) {
    throw new Error(`Papel "${String(role)}" não existe no registro em uso`);
  }

  const cascade = override ? override.cascade : definicao.cascade;
  if (!cascade || cascade.length === 0) {
    throw new Error(`Papel "${String(role)}" não tem nenhum modelo na cascata`);
  }
  return cascade;
}

/**
 * Resolve um papel na cascata de modelos que o atende, na ordem de tentativa.
 *
 * O retorno tem a forma de FallbackStep menos a apiKey, de propósito: quem
 * chama completa com a chave e passa direto para completeWithFallback.
 */
export function resolveRole(role: Role, product?: Product): ResolvedModel[] {
  return cascadeOf(role, product).map((model) => {
    const meta = modelOf(model);
    const p = providerOf(meta.provider);

    // Motor medido é o objeto da medição, não ferramenta: hadrians consulta o
    // Gemini para saber o que o Gemini responde sobre a marca do cliente.
    // Trocá-lo mudaria o que está sendo medido, então ele nunca serve a um
    // papel — e a falha aqui é barulhenta porque o estrago seria silencioso.
    if (meta.measuredEngine) {
      throw new Error(
        `"${model}" é motor medido e não pode atender o papel "${role}" — ` +
          'trocar um motor medido muda o que o produto mede, não a ferramenta que ele usa.',
      );
    }

    if (!p.api) {
      throw new Error(
        `Provedor "${meta.provider}" (de "${model}") não é falado por este cliente — ` +
          'está no catálogo apenas para ter preço.',
      );
    }

    // baseUrl escrita de memória não vai para produção por acidente. Confirmar
    // na doc do provedor e virar `verified: true` é um passo consciente, com
    // alguém tendo olhado — o precedente é o models.yaml do VanguardAI, que
    // registra a data de cada conferência ao vivo.
    if (!p.verified) {
      throw new Error(
        `Provedor "${meta.provider}" está marcado \`verified: false\` — a baseUrl ainda ` +
          'não foi confirmada contra a documentação dele. Confirme e marque verified antes de apontar um papel para cá.',
      );
    }

    return {
      model,
      provider: meta.provider as ProviderId,
      providerSpec: {
        api: p.api as ProviderSpec['api'],
        ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
        ...(p.sdk ? { sdk: p.sdk as 'groq' } : {}),
      },
    };
  });
}

/**
 * Os NOMES das variáveis de ambiente que este papel exige, sem repetição.
 *
 * Serve para o produto conferir na subida o que falta, em vez de descobrir na
 * primeira chamada em produção — que é como uma troca de provedor costuma dar
 * errado: o código novo sobe, e só o primeiro cliente a usar aquele caminho
 * descobre que a chave não existe naquele ambiente.
 *
 * Devolve nome, nunca valor: a lib não lê env var.
 */
export function requiredEnvKeys(role: Role, product?: Product): string[] {
  const chaves = resolveRole(role, product).map((r) => providerOf(r.provider as string).envKey);
  return [...new Set(chaves)];
}

/** O nome da variável de ambiente de um provedor. */
export function envKeyOf(provider: ProviderId): string {
  return providerOf(provider as string).envKey;
}

/** O spec de um provedor, para quem chama complete() fora de um papel. */
export function providerSpecOf(provider: ProviderId): ProviderSpec {
  const p = providerOf(provider as string);
  return {
    api: p.api as ProviderSpec['api'],
    ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
    ...(p.sdk ? { sdk: p.sdk as 'groq' } : {}),
  };
}

/**
 * O catálogo inteiro, motores medidos incluídos.
 *
 * É o que o pricing.ts do coletor consome: preço precisa conhecer TODO modelo
 * que gera custo, inclusive os que este cliente não sabe chamar. Foi por não
 * existir essa lista que gemini-2.0-flash roda em produção no hadrians sem
 * estar precificado em lugar nenhum.
 */
export function modelCatalog(): CatalogEntry[] {
  return Object.entries(models()).map(([model, meta]) => ({
    model,
    provider: meta.provider,
    measuredEngine: meta.measuredEngine === true,
  }));
}

/** Os papéis existentes — útil para varredura e para teste de cobertura. */
export function roles(): Role[] {
  return Object.keys(registroAtual().roles) as Role[];
}

/** Os provedores declarados, com o que já foi confirmado contra a doc deles. */
export function providerIds(): { id: string; verified: boolean; callable: boolean }[] {
  return Object.entries(providers()).map(([id, p]) => ({
    id,
    verified: p.verified === true,
    callable: Boolean(p.api),
  }));
}

/** A versão do registro EM USO — muda quando o coletor entrega uma edição nova. */
export function registryVersion(): number {
  return registroAtual().version;
}

/** A versão que veio compilada no pacote. Constante, e é a reserva. */
export const REGISTRY_VERSION = compilado.version;

// Reexportado para quem monta FallbackStep na mão sem passar por resolveRole.
export type { Provider, ProviderId, ProviderSpec };
