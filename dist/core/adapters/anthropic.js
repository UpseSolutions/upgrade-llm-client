"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeAnthropic = completeAnthropic;
exports.streamAnthropic = streamAnthropic;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
async function completeAnthropic(params) {
    const client = new sdk_1.default({ apiKey: params.apiKey });
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
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            cachedTokens: response.usage.cache_read_input_tokens ?? undefined,
        },
        raw: response,
    };
}
async function* streamAnthropic(params) {
    const client = new sdk_1.default({ apiKey: params.apiKey });
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
            usage.inputTokens = event.message.usage.input_tokens;
            usage.cachedTokens = event.message.usage.cache_read_input_tokens ?? undefined;
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