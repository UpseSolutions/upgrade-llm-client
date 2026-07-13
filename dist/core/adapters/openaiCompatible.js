"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeOpenAICompatible = completeOpenAICompatible;
exports.streamOpenAICompatible = streamOpenAICompatible;
const openai_1 = __importDefault(require("openai"));
const groq_sdk_1 = __importDefault(require("groq-sdk"));
function getClient(provider, apiKey) {
    const fetchOpt = { fetch: globalThis.fetch };
    return provider === 'openai'
        ? new openai_1.default({ apiKey, ...fetchOpt })
        : new groq_sdk_1.default({ apiKey, ...fetchOpt });
}
function buildMessages(params) {
    const messages = [];
    if (params.system)
        messages.push({ role: 'system', content: params.system });
    for (const m of params.messages)
        messages.push({ role: m.role, content: m.content });
    return messages;
}
async function completeOpenAICompatible(provider, params) {
    const client = getClient(provider, params.apiKey);
    const response = await client.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: buildMessages(params),
        tools: params.tools,
    }, { signal: params.signal });
    const usage = {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        cachedTokens: response.usage
            ?.prompt_tokens_details?.cached_tokens,
    };
    return {
        text: response.choices[0]?.message?.content ?? '',
        usage,
        raw: response,
    };
}
async function* streamOpenAICompatible(provider, params) {
    const client = getClient(provider, params.apiKey);
    const stream = await client.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: buildMessages(params),
        tools: params.tools,
        stream: true,
        stream_options: { include_usage: true },
    }, { signal: params.signal });
    let usage = { inputTokens: 0, outputTokens: 0 };
    for await (const chunk of stream) {
        if (chunk.usage) {
            usage = {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
            };
        }
        yield chunk;
    }
    return { usage, raw: undefined };
}
//# sourceMappingURL=openaiCompatible.js.map