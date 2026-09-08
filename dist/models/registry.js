"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTRY_VERSION = void 0;
exports.resolveRole = resolveRole;
exports.modelCatalog = modelCatalog;
exports.roles = roles;
const models_json_1 = __importDefault(require("./models.json"));
const CLIENT_PROVIDERS = ['anthropic', 'openai', 'groq'];
function entry(model) {
    const found = models_json_1.default.models[model];
    if (!found) {
        throw new Error(`Modelo "${model}" não existe no registro (src/models/models.json)`);
    }
    return found;
}
function resolveRole(role, product) {
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
    return cascade.map((model) => {
        const found = entry(model);
        if (found.measuredEngine) {
            throw new Error(`"${model}" é motor medido e não pode atender o papel "${role}" — ` +
                'trocar um motor medido muda o que o produto mede, não a ferramenta que ele usa.');
        }
        if (!CLIENT_PROVIDERS.includes(found.provider)) {
            throw new Error(`Provedor "${found.provider}" (de "${model}") não é falado por este cliente — ` +
                `só ${CLIENT_PROVIDERS.join(', ')}.`);
        }
        return { model, provider: found.provider };
    });
}
function modelCatalog() {
    return Object.entries(models_json_1.default.models).map(([model, meta]) => ({
        model,
        provider: meta.provider,
        measuredEngine: meta.measuredEngine === true,
    }));
}
function roles() {
    return Object.keys(models_json_1.default.roles);
}
exports.REGISTRY_VERSION = models_json_1.default.version;
//# sourceMappingURL=registry.js.map