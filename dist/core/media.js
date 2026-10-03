"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImageRaw = generateImageRaw;
exports.transcribeRaw = transcribeRaw;
const openai_1 = __importDefault(require("openai"));
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const fetchOpt = { fetch: globalThis.fetch };
async function generateImageRaw(params) {
    const client = new openai_1.default({ apiKey: params.apiKey, ...fetchOpt });
    const response = await client.images.generate({
        model: params.model,
        prompt: params.prompt,
        n: 1,
        size: params.size ?? '1024x1024',
        quality: params.quality ?? 'medium',
    }, { signal: params.signal });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64)
        throw new Error(`[llm-client] ${params.model} não devolveu imagem`);
    return {
        image: Buffer.from(b64, 'base64'),
        usage: {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
        },
        raw: response,
    };
}
const cobradoPorMinuto = (model) => /whisper/i.test(model);
async function transcribeRaw(params) {
    const client = params.provider === 'groq'
        ? new groq_sdk_1.default({ apiKey: params.apiKey })
        : new openai_1.default({ apiKey: params.apiKey });
    const porMinuto = cobradoPorMinuto(params.model);
    const response = (await client.audio.transcriptions.create({
        file: params.file,
        model: params.model,
        language: params.language,
        response_format: porMinuto ? 'verbose_json' : 'json',
    }, { signal: params.signal }));
    return {
        text: response.text ?? '',
        audioSeconds: Number(response.duration ?? response.usage?.seconds ?? 0) || 0,
        usage: {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
        },
        raw: response,
    };
}
//# sourceMappingURL=media.js.map