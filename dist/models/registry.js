"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTRY_VERSION = void 0;
exports.resolveRole = resolveRole;
exports.requiredEnvKeys = requiredEnvKeys;
exports.envKeyOf = envKeyOf;
exports.providerSpecOf = providerSpecOf;
exports.modelCatalog = modelCatalog;
exports.roles = roles;
exports.providerIds = providerIds;
const models_json_1 = __importDefault(require("./models.json"));
const providers = models_json_1.default.providers;
const models = models_json_1.default.models;
function providerOf(id) {
    const found = providers[id];
    if (!found) {
        throw new Error(`Provedor "${id}" não existe no registro (src/models/models.json)`);
    }
    return found;
}
function modelOf(id) {
    const found = models[id];
    if (!found) {
        throw new Error(`Modelo "${id}" não existe no registro (src/models/models.json)`);
    }
    return found;
}
function cascadeOf(role, product) {
    const override = product
        ? models_json_1.default.products[product]?.roles?.[role]
        : undefined;
    if (override && !override.reason) {
        throw new Error(`Override de "${role}" em ${product} não tem \`reason\`. ` +
            'Toda divergência entre produtos precisa de razão escrita — sem ela, use o default.');
    }
    const cascade = override ? override.cascade : models_json_1.default.roles[role].cascade;
    if (!cascade || cascade.length === 0) {
        throw new Error(`Papel "${role}" não tem nenhum modelo na cascata`);
    }
    return cascade;
}
function resolveRole(role, product) {
    return cascadeOf(role, product).map((model) => {
        const meta = modelOf(model);
        const p = providerOf(meta.provider);
        if (meta.measuredEngine) {
            throw new Error(`"${model}" é motor medido e não pode atender o papel "${role}" — ` +
                'trocar um motor medido muda o que o produto mede, não a ferramenta que ele usa.');
        }
        if (!p.api) {
            throw new Error(`Provedor "${meta.provider}" (de "${model}") não é falado por este cliente — ` +
                'está no catálogo apenas para ter preço.');
        }
        if (!p.verified) {
            throw new Error(`Provedor "${meta.provider}" está marcado \`verified: false\` — a baseUrl ainda ` +
                'não foi confirmada contra a documentação dele. Confirme e marque verified antes de apontar um papel para cá.');
        }
        return {
            model,
            provider: meta.provider,
            providerSpec: {
                api: p.api,
                ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
                ...(p.sdk ? { sdk: p.sdk } : {}),
            },
        };
    });
}
function requiredEnvKeys(role, product) {
    const chaves = resolveRole(role, product).map((r) => providerOf(r.provider).envKey);
    return [...new Set(chaves)];
}
function envKeyOf(provider) {
    return providerOf(provider).envKey;
}
function providerSpecOf(provider) {
    const p = providerOf(provider);
    return {
        api: p.api,
        ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
        ...(p.sdk ? { sdk: p.sdk } : {}),
    };
}
function modelCatalog() {
    return Object.entries(models).map(([model, meta]) => ({
        model,
        provider: meta.provider,
        measuredEngine: meta.measuredEngine === true,
    }));
}
function roles() {
    return Object.keys(models_json_1.default.roles);
}
function providerIds() {
    return Object.entries(providers).map(([id, p]) => ({
        id,
        verified: p.verified === true,
        callable: Boolean(p.api),
    }));
}
exports.REGISTRY_VERSION = models_json_1.default.version;
//# sourceMappingURL=registry.js.map