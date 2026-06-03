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

import { normalizeAiText } from './normalizeAiText';

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

    if (message?.content) {
        return {
            message: normalizeAiText(message.content),
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
