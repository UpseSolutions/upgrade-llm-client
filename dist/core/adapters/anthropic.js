"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usoDaAnthropic = usoDaAnthropic;
exports.completeAnthropic = completeAnthropic;
exports.streamAnthropic = streamAnthropic;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
function newAnthropicClient(apiKey, baseUrl) {
    return new sdk_1.default({ apiKey, baseURL: baseUrl, fetch: globalThis.fetch });
}
function usoDaAnthropic(u) {
    const gravados = u.cache_creation_input_tokens ?? 0;
    return {
        inputTokens: (u.input_tokens ?? 0) + gravados,
        cachedTokens: u.cache_read_input_tokens ?? undefined,
        ...(gravados > 0 ? { cacheWriteTokens: gravados } : {}),
    };
}
async function completeAnthropic(params) {
    const client = newAnthropicClient(params.apiKey, params.providerSpec?.baseUrl);
    const response = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        system: params.system,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: params.tools,
    }, { signal: params.signal });
    const textBlock = response.content.find((b) => b.type === 'text');
    return {
        text: textBlock?.text ?? '',
        usage: {
            ...usoDaAnthropic(response.usage),
            outputTokens: response.usage.output_tokens,
        },
        raw: response,
    };
}
async function* streamAnthropic(params) {
    const client = newAnthropicClient(params.apiKey, params.providerSpec?.baseUrl);
    const stream = client.messages.stream({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        system: params.system,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: params.tools,
    }, { signal: params.signal });
    let usage = { inputTokens: 0, outputTokens: 0 };
    for await (const event of stream) {
        if (event.type === 'message_start') {
            usage = { ...usage, ...usoDaAnthropic(event.message.usage) };
        }
        if (event.type === 'message_delta') {
            usage.outputTokens = event.usage.output_tokens;
        }
        yield event;
    }
    const finalMessage = await stream.finalMessage();
    return { usage, raw: finalMessage };
}
//# sourceMappingURL=anthropic.js.map