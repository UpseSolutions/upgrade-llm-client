import { Provider, Product } from '../core/types';
import registry from './models.json';

// Acesso tipado ao registro central (src/models/models.json — leia o `_leiaMe`
// de lá antes de mexer).
//
// A lib continua sem ler env var: o registro devolve QUAL modelo e de QUAL
// provedor, nunca a chave. Quem chama segue decidindo de onde vêm as chaves,
// exatamente como em complete() e completeWithFallback().

export type Role = keyof typeof registry.roles;

export interface ResolvedModel {
  model: string;
  provider: Provider;
}

export interface CatalogEntry {
  model: string;
  provider: string;
  measuredEngine: boolean;
}

const CLIENT_PROVIDERS: readonly string[] = ['anthropic', 'openai', 'groq'];

function entry(model: string) {
  const found = (registry.models as Record<string, { provider: string; measuredEngine?: boolean }>)[model];
  if (!found) {
    throw new Error(`Modelo "${model}" não existe no registro (src/models/models.json)`);
  }
  return found;
}

/**
 * Resolve um papel na cascata de modelos que o atende, na ordem de tentativa.
 *
 * `product` aplica o override daquele produto quando existe. Override sem
 * `reason` no JSON é erro — divergência sem razão escrita é o que fez os
 * modelos se espalharem por oito repositórios em primeiro lugar.
 *
 * O retorno tem a forma de FallbackStep menos a apiKey, de propósito: quem
 * chama completa com a chave e passa direto para completeWithFallback.
 */
export function resolveRole(role: Role, product?: Product): ResolvedModel[] {
  const override = product
    ? (registry.products as Record<string, { roles?: Record<string, { cascade: string[]; reason?: string }> }>)[product]?.roles?.[role]
    : undefined;

  if (override && !override.reason) {
    throw new Error(
      `Override de "${role}" em ${product} não tem \`reason\`. ` +
        'Toda divergência entre produtos precisa de razão escrita — sem ela, use o default.',
    );
  }

  const cascade = override ? override.cascade : registry.roles[role].cascade;

  if (!cascade || cascade.length === 0) {
    throw new Error(`Papel "${role}" não tem nenhum modelo na cascata`);
  }

  return cascade.map((model) => {
    const found = entry(model);

    // Motor medido é o objeto da medição, não ferramenta: hadrians consulta o
    // Gemini para saber o que o Gemini responde sobre a marca do cliente.
    // Trocá-lo mudaria o que está sendo medido, então ele nunca serve a um
    // papel — e a falha aqui é barulhenta porque o estrago seria silencioso.
    if (found.measuredEngine) {
      throw new Error(
        `"${model}" é motor medido e não pode atender o papel "${role}" — ` +
          'trocar um motor medido muda o que o produto mede, não a ferramenta que ele usa.',
      );
    }

    if (!CLIENT_PROVIDERS.includes(found.provider)) {
      throw new Error(
        `Provedor "${found.provider}" (de "${model}") não é falado por este cliente — ` +
          `só ${CLIENT_PROVIDERS.join(', ')}.`,
      );
    }

    return { model, provider: found.provider as Provider };
  });
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
  return Object.entries(registry.models as Record<string, { provider: string; measuredEngine?: boolean }>).map(
    ([model, meta]) => ({
      model,
      provider: meta.provider,
      measuredEngine: meta.measuredEngine === true,
    }),
  );
}

/** Os papéis existentes — útil para varredura e para teste de cobertura. */
export function roles(): Role[] {
  return Object.keys(registry.roles) as Role[];
}

export const REGISTRY_VERSION = registry.version;
