/**
 * Provider Adapter — builds provider-correct HTTP request payloads
 * and parses responses for all supported AI providers.
 *
 * Centralizes format differences so routes never send `messages` to Gemini
 * or `contents` to OpenAI.
 *
 * Supported formats:
 *   OpenAI-compatible (openai, deepseek, groq, openrouter, kiro, openai-compatible) → messages[]
 *   Gemini native    (gemini, google)                                              → contents[]
 *   Anthropic        (anthropic)                                                   → Anthropic messages[]
 */

// ── URL Normalization ──────────────────────────────────────────────────────────

/**
 * Normalizes a base URL for OpenAI-compatible providers.
 * Ensures the URL ends with /v1 without double-adding it.
 *
 * @example
 *   normalizeOpenAICompatibleBaseUrl('https://api.deepseek.com')     → 'https://api.deepseek.com/v1'
 *   normalizeOpenAICompatibleBaseUrl('https://api.deepseek.com/v1')  → 'https://api.deepseek.com/v1'
 *   normalizeOpenAICompatibleBaseUrl('https://api.deepseek.com/v1/') → 'https://api.deepseek.com/v1'
 */
export function normalizeOpenAICompatibleBaseUrl(url: string): string {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean.endsWith('/v1')) return clean;
    return `${clean}/v1`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProviderFormat = 'openai' | 'gemini' | 'anthropic';

export interface ProviderRequest {
    url: string;
    headers: Record<string, string>;
    body: Record<string, any>;
}

export interface ProviderResponse {
    message: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/** Streaming chunk from provider */
export interface StreamChunk {
    contentDelta?: string;
    thinkingDelta?: string;
    toolCallsDelta?: any[];
    usage?: Record<string, unknown>;
    done?: boolean;
    finishReason?: string;
}

import { normalizeAiText } from './normalizeAiText';
import { mergeToolCalls } from './responseParser';

// ── Detect format ──────────────────────────────────────────────────────────────

const GEMINI_PROVIDERS = new Set(['gemini', 'google']);
const ANTHROPIC_PROVIDERS = new Set(['anthropic']);

export function detectProviderFormat(providerSlug: string): ProviderFormat {
    if (GEMINI_PROVIDERS.has(providerSlug)) return 'gemini';
    if (ANTHROPIC_PROVIDERS.has(providerSlug)) return 'anthropic';
    return 'openai';
}

// ── Endpoint resolution ────────────────────────────────────────────────────────

const DEFAULT_ENDPOINTS: Record<string, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    google: 'https://generativelanguage.googleapis.com/v1beta/models',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
};

/**
 * Resolve endpoint URL and HTTP headers for a provider.
 */
export function resolveProviderRequest(
    providerSlug: string,
    modelId: string,
    apiKey: string,
    baseUrl?: string,
): { url: string; headers: Record<string, string> } {
    const format = detectProviderFormat(providerSlug);

    // ── Gemini native API ──────────────────────────────────────────────────
    if (format === 'gemini') {
        const base = baseUrl || DEFAULT_ENDPOINTS[providerSlug] || 'https://generativelanguage.googleapis.com/v1beta/models';
        // Append model + action to base URL, API key as query param
        const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(modelId)}:generateContent?key=${apiKey}`;
        return {
            url,
            headers: { 'Content-Type': 'application/json' },
        };
    }

    // ── Anthropic ──────────────────────────────────────────────────────────
    if (format === 'anthropic') {
        const url = baseUrl || DEFAULT_ENDPOINTS[providerSlug] || 'https://api.anthropic.com/v1/messages';
        return {
            url,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
        };
    }

    // ── OpenAI-compatible ──────────────────────────────────────────────────
    let url: string;
    if (baseUrl) {
        url = baseUrl;
        // Auto-append /chat/completions if base ends with /v1
        if (url.endsWith('/v1')) url = `${url}/chat/completions`;
    } else {
        url = DEFAULT_ENDPOINTS[providerSlug] || 'https://api.openai.com/v1/chat/completions';
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
    };

    // OpenRouter specific headers
    if (providerSlug === 'openrouter') {
        headers['HTTP-Referer'] = 'https://kakarama.com';
        headers['X-Title'] = 'KR Analytics';
    }

    return { url, headers };
}

// ── Request body builder ───────────────────────────────────────────────────────

export interface BuildBodyOptions {
    /** System-level instruction (first message for OpenAI, system_instruction for Gemini) */
    systemContent: string;
    /** Optional user message separate from system content */
    userContent?: string;
    /** Function/tool definitions */
    tools?: any[];
    /** Whether to allow tool_choice: 'auto' */
    toolChoiceAuto?: boolean;
    maxTokens?: number;
    temperature?: number;
    /** Enable streaming (OpenAI-compatible adds stream:true + stream_options) */
    stream?: boolean;
}

/**
 * Build provider-correct HTTP request body.
 *
 * Never sends `messages` to Gemini native API.
 * Never sends `contents` to OpenAI-compatible API.
 */
export function buildProviderBody(
    providerSlug: string,
    modelId: string,
    options: BuildBodyOptions,
): Record<string, any> {
    const format = detectProviderFormat(providerSlug);
    const {
        systemContent,
        userContent,
        tools,
        toolChoiceAuto,
        maxTokens = 1024,
        temperature = 0.7,
        stream,
    } = options;

    // ── Gemini native format ───────────────────────────────────────────────
    if (format === 'gemini') {
        const body: Record<string, any> = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: userContent || systemContent }],
                },
            ],
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        };

        // If we have both system content AND separate user content,
        // set system_instruction for Gemini
        if (systemContent && userContent) {
            body.system_instruction = {
                parts: [{ text: systemContent }],
            };
        }

        return body;
    }

    // ── Anthropic format ───────────────────────────────────────────────────
    if (format === 'anthropic') {
        const messages: any[] = [];
        if (userContent) {
            messages.push({ role: 'user', content: userContent });
        } else {
            messages.push({ role: 'user', content: systemContent });
        }

        const body: Record<string, any> = {
            model: modelId,
            max_tokens: maxTokens,
            messages,
        };

        // Anthropic sends system separately, not as a message role
        if (systemContent && userContent) {
            body.system = systemContent;
        }

        if (stream) {
            body.stream = true;
        }

        return body;
    }

    // ── OpenAI-compatible format ───────────────────────────────────────────
    const messages: any[] = [];

    // System message (only if we have system content)
    if (systemContent) {
        messages.push({ role: 'system', content: systemContent });
    }

    // User message
    if (userContent) {
        messages.push({ role: 'user', content: userContent });
    } else if (!systemContent) {
        // At minimum, ensure messages array is not empty
        messages.push({ role: 'user', content: 'Hello' });
    }

    const body: Record<string, any> = {
        model: modelId,
        messages,
        temperature,
        max_tokens: maxTokens,
    };

    // Tools
    if (tools && tools.length > 0) {
        body.tools = tools;
        if (toolChoiceAuto) {
            body.tool_choice = 'auto';
        }
    }

    // Streaming
    if (stream) {
        body.stream = true;
        body.stream_options = { include_usage: true };
    }

    return body;
}

// ── Response parser ────────────────────────────────────────────────────────────

/**
 * Parse provider response into standard { message, usage? } format.
 * Throws on empty/unparseable response.
 *
 * All message outputs are passed through normalizeAiText() to strip
 * any JSON wrapping that the provider may have returned.
 */
export function parseProviderResponse(
    providerSlug: string,
    rawData: any,
): ProviderResponse {
    const format = detectProviderFormat(providerSlug);

    // ── Gemini ──────────────────────────────────────────────────────────────
    if (format === 'gemini') {
        const candidate = rawData?.candidates?.[0];
        const content = candidate?.content;
        const text = content?.parts?.[0]?.text;

        if (!text) {
            // Check for blocked content
            const blockReason = candidate?.finishReason || candidate?.safetyRatings;
            if (blockReason) {
                throw new Error(`Respons AI diblokir: ${JSON.stringify(blockReason)}`);
            }
            throw new Error('Respons AI kosong dari Gemini.');
        }

        return {
            message: normalizeAiText(text),
            usage: rawData?.usageMetadata
                ? {
                    prompt_tokens: rawData.usageMetadata.promptTokenCount || 0,
                    completion_tokens: rawData.usageMetadata.candidatesTokenCount || 0,
                    total_tokens: rawData.usageMetadata.totalTokenCount || 0,
                }
                : undefined,
        };
    }

    // ── Anthropic ───────────────────────────────────────────────────────────
    if (format === 'anthropic') {
        const blocks = rawData?.content || [];
        const textBlocks = blocks.filter((b: any) => b.type === 'text');
        const text = textBlocks.map((b: any) => b.text).join('\n').trim();

        if (!text) {
            throw new Error('Respons AI kosong dari Anthropic.');
        }

        return {
            message: normalizeAiText(text),
            usage: rawData?.usage
                ? {
                    prompt_tokens: rawData.usage.input_tokens || 0,
                    completion_tokens: rawData.usage.output_tokens || 0,
                    total_tokens: (rawData.usage.input_tokens || 0) + (rawData.usage.output_tokens || 0),
                }
                : undefined,
        };
    }

    // ── OpenAI-compatible ──────────────────────────────────────────────────
    const choice = rawData?.choices?.[0];
    const message = choice?.message;

    // DeepSeek reasoner / thinking models return content in reasoning_content
    // instead of content. Check reasoning_content first, then content.
    const contentText = message?.reasoning_content || message?.content;

    if (contentText) {
        return {
            message: normalizeAiText(contentText),
            usage: rawData?.usage
                ? {
                    prompt_tokens: rawData.usage.prompt_tokens || 0,
                    completion_tokens: rawData.usage.completion_tokens || 0,
                    total_tokens: rawData.usage.total_tokens || 0,
                }
                : undefined,
        };
    }

    // Fallback: check alternative fields
    if (rawData?.output_text) {
        return { message: normalizeAiText(rawData.output_text) };
    }
    if (rawData?.content) {
        if (typeof rawData.content === 'string') {
            return { message: normalizeAiText(rawData.content) };
        }
        const text = rawData.content?.text
            || rawData.content?.content
            || rawData.content?.message
            || (Array.isArray(rawData.content)
                ? rawData.content.map((c: any) => typeof c === 'string' ? c : c.text || c.content || '').filter(Boolean).join('\n')
                : null);
        if (text) {
            return { message: normalizeAiText(text) };
        }
        // Last resort — return normalized form
        const fallback = normalizeAiText(rawData.content);
        if (fallback) {
            return { message: fallback };
        }
        return { message: JSON.stringify(rawData.content) };
    }

    throw new Error('Respons AI kosong.');
}

// ── Streaming response handler ─────────────────────────────────────────────────

/**
 * Parse a single SSE text line from an OpenAI-compatible streaming response.
 * Returns content/thinking deltas and whether the stream is done.
 */
function parseOpenAISSELine(line: string): StreamChunk {
    const result: StreamChunk = {};
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return result;

    const payload = trimmed.replace(/^data:\s*/, '').trim();
    if (!payload || payload === '[DONE]') {
        if (payload === '[DONE]') result.done = true;
        return result;
    }

    try {
        const parsed = JSON.parse(payload);
        const choice = parsed?.choices?.[0];
        if (choice) {
            const msg = choice.delta || choice.message;
            if (msg) {
                if (typeof msg.reasoning_content === 'string' && msg.reasoning_content) {
                    result.thinkingDelta = msg.reasoning_content;
                }
                if (typeof msg.reasoning === 'string' && msg.reasoning) {
                    result.thinkingDelta = (result.thinkingDelta || '') + msg.reasoning;
                }
                if (typeof msg.content === 'string' && msg.content) {
                    result.contentDelta = msg.content;
                }
                // Extract tool_calls from delta (streaming) — enables
                // tool-call detection without a second non-streaming API call.
                if (Array.isArray(msg.tool_calls)) {
                    result.toolCallsDelta = msg.tool_calls;
                }
            }
            if (choice.finish_reason && choice.finish_reason !== 'null') {
                result.done = true;
                result.finishReason = choice.finish_reason;
            }
        }
        if (parsed.usage) {
            result.usage = parsed.usage as Record<string, unknown>;
        }
    } catch {
        // Skip malformed JSON
    }

    return result;
}

/**
 * Stream an AI provider response as an async generator.
 * Yields StreamChunk objects with content/thinking deltas.
 *
 * Supports:
 * - OpenAI-compatible SSE (stream: true)
 * - Anthropic event-stream
 *
 * For Gemini native, falls back to non-streaming since the
 * OpenAI-compatible endpoint is the preferred path.
 *
 * @example
 * ```ts
 * for await (const chunk of streamProviderResponse(provider, model, key, url, body)) {
 *   if (chunk.contentDelta) processAnswer(chunk.contentDelta);
 *   if (chunk.thinkingDelta) processThinking(chunk.thinkingDelta);
 *   if (chunk.done) break;
 * }
 * ```
 */
export async function* streamProviderResponse(
    providerSlug: string,
    modelId: string,
    apiKey: string,
    baseUrl: string | undefined,
    body: Record<string, any>,
): AsyncGenerator<StreamChunk> {
    const format = detectProviderFormat(providerSlug);
    const { url: resolvedUrl, headers } = resolveProviderRequest(providerSlug, modelId, apiKey, baseUrl);

    // ── Gemini native streaming ─────────────────────────────────────────
    if (format === 'gemini') {
        // Gemini native uses :streamGenerateContent endpoint
        const streamUrl = resolvedUrl.replace(':generateContent', ':streamGenerateContent');
        const res = await fetch(streamUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`AI API error: ${res.status} - ${errorText.substring(0, 300)}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('Response body is not readable');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done: streamDone, value } = await reader.read();
            if (streamDone) break;

            buffer += decoder.decode(value, { stream: true });
            // Gemini SSE format uses data: {...}\n
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim().startsWith('data:')) continue;
                const payload = line.trim().replace(/^data:\s*/, '').trim();
                if (!payload || payload === '[DONE]') {
                    if (payload === '[DONE]') yield { done: true, finishReason: 'stop' };
                    continue;
                }
                try {
                    const parsed = JSON.parse(payload);
                    const candidate = parsed?.candidates?.[0];
                    if (candidate?.content?.parts?.[0]?.text) {
                        yield { contentDelta: candidate.content.parts[0].text };
                    }
                    if (candidate?.finishReason) {
                        yield { done: true, finishReason: candidate.finishReason };
                    }
                } catch { /* skip */ }
            }
        }

        yield { done: true, finishReason: 'stop' };
        return;
    }

    // ── Anthropic streaming ────────────────────────────────────────────
    if (format === 'anthropic') {
        // Anthropic uses event stream: event: message_start, content_block_delta, etc.
        const bodyWithStream = { ...body, stream: true };
        const res = await fetch(resolvedUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyWithStream),
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`AI API error: ${res.status} - ${errorText.substring(0, 300)}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('Response body is not readable');

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        while (true) {
            const { done: streamDone, value } = await reader.read();
            if (streamDone) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const clean = line.trim();
                if (clean.startsWith('event:')) {
                    currentEvent = clean.replace(/^event:\s*/, '').trim();
                } else if (clean.startsWith('data:')) {
                    const payload = clean.replace(/^data:\s*/, '').trim();
                    if (!payload) continue;

                    try {
                        const parsed = JSON.parse(payload);
                        if (currentEvent === 'content_block_delta') {
                            const delta = parsed.delta;
                            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                                yield { contentDelta: delta.text };
                            }
                            if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                                yield { thinkingDelta: delta.thinking };
                            }
                        } else if (currentEvent === 'message_start' && parsed?.usage) {
                            yield { usage: parsed.usage as Record<string, unknown> };
                        } else if (currentEvent === 'message_delta') {
                            if (parsed?.usage) {
                                yield { usage: parsed.usage as Record<string, unknown> };
                            }
                            if (parsed?.delta?.stop_reason) {
                                yield { done: true, finishReason: parsed.delta.stop_reason };
                            }
                        } else if (currentEvent === 'message_stop') {
                            yield { done: true, finishReason: 'stop' };
                        }
                    } catch { /* skip */ }
                }
            }
        }

        yield { done: true, finishReason: 'stop' };
        return;
    }

    // ── OpenAI-compatible streaming ────────────────────────────────────
    const bodyWithStream = {
        ...body,
        stream: true,
        stream_options: { include_usage: true },
    };

    const res = await fetch(resolvedUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyWithStream),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API error: ${res.status} - ${errorText.substring(0, 300)}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';
    let hasEmittedDone = false;

    while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const chunk = parseOpenAISSELine(line);
            if (chunk.thinkingDelta) yield { thinkingDelta: chunk.thinkingDelta };
            if (chunk.contentDelta) yield { contentDelta: chunk.contentDelta };
            if (chunk.toolCallsDelta) yield { toolCallsDelta: chunk.toolCallsDelta };
            if (chunk.usage) yield { usage: chunk.usage };
            if (chunk.done && !hasEmittedDone) {
                hasEmittedDone = true;
                yield { done: true, finishReason: chunk.finishReason || 'stop' };
            }
        }
    }

    if (!hasEmittedDone) {
        yield { done: true, finishReason: 'stop' };
    }
}
