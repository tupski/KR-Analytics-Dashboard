/**
 * Model Fetcher
 *
 * Fetches available models from various AI provider APIs.
 * Handles provider-specific endpoints and error cases.
 *
 * SECURITY: This module runs server-side only. API keys are never exposed to the client.
 *
 * P0-4 FIX: Robust empty JSON handling, proper error messages, no raw parse errors.
 */

import type { FetchResult, ProviderFetchConfig } from '@/types/ai-models';
import { normalizeOpenAICompatibleBaseUrl } from './providerAdapter';

const FETCH_TIMEOUT = 10000; // 10 seconds

/**
 * DeepSeek fallback models when /models endpoint is unavailable.
 * DeepSeek's API may not expose a /models endpoint, so we provide
 * the well-known model IDs as a fallback.
 */
const DEEPSEEK_FALLBACK_MODELS = [
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek' },
];

/**
 * Safely parse JSON from a response, handling empty/malformed bodies.
 */
async function safeJsonResponse(response: Response): Promise<any> {
    const text = await response.text();

    // Handle empty response
    if (!text || text.trim() === '') {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        // Return null for non-JSON responses — caller should check
        return null;
    }
}

/**
 * Extract models array from various response formats.
 * Handles: { data: [...] }, { models: [...] }, [...], { data: { models: [...] } }
 */
function extractModelsArray(data: any): any[] | null {
    // Direct array: [...]
    if (Array.isArray(data)) return data;

    // OpenAI format: { data: [{id: ...}, ...] }
    if (data.data && Array.isArray(data.data)) return data.data;

    // Google/other format: { models: [...] }
    if (data.models && Array.isArray(data.models)) return data.models;

    // Nested: { data: { models: [...] } }
    if (data.data && data.data.models && Array.isArray(data.data.models)) {
        return data.data.models;
    }

    return null;
}

/**
 * Fetch models from OpenAI Compatible endpoint
 * Used by: OpenRouter, Together AI, Fireworks, Ollama, etc.
 * 
 * P0-4 FIX: Handles empty responses, non-JSON, and various wrapper formats.
 */
export async function fetchOpenAICompatibleModels(
    baseUrl: string,
    apiKey: string
): Promise<FetchResult> {
    try {
        // Normalize base URL ensuring /v1 suffix for OpenAI-compatible providers
        const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(baseUrl);
        const url = `${normalizedBaseUrl}/models`;

        console.log('[fetchOpenAICompatibleModels] Fetching from:', url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle HTTP errors
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return { success: false, error: 'API key tidak valid atau tidak punya akses.' };
            }
            if (response.status === 404) {
                return { success: false, error: 'Endpoint /models tidak tersedia untuk provider ini.' };
            }
            if (response.status === 405) {
                return { success: false, error: 'Method tidak didukung — endpoint models membutuhkan GET.' };
            }
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const data = await safeJsonResponse(response);

        // Handle empty or null response
        if (!data) {
            return { success: false, error: 'Provider memberikan respons kosong.' };
        }

        // Extract models from any known format
        const models = extractModelsArray(data);

        if (!models || models.length === 0) {
            return { success: false, error: 'Tidak ada model ditemukan dari provider ini.' };
        }

        // Normalize to OpenAI-compatible format for the normalizer
        const normalizedData = { object: 'list', data: models };

        console.log('[fetchOpenAICompatibleModels] Success:', models.length, 'models');
        return { success: true, data: normalizedData };

    } catch (error: any) {
        console.error('[fetchOpenAICompatibleModels] Error:', error);

        if (error.name === 'AbortError') {
            return { success: false, error: 'Request timeout. Coba lagi.' };
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return { success: false, error: 'Gagal menghubungi provider. Periksa Base URL dan koneksi server.' };
        }

        return { success: false, error: 'Gagal menghubungi provider. Periksa Base URL dan koneksi server.' };
    }
}

/**
 * Fetch models from official OpenAI API
 */
export async function fetchOpenAIModels(apiKey: string): Promise<FetchResult> {
    return fetchOpenAICompatibleModels('https://api.openai.com/v1', apiKey);
}

/**
 * Fetch models from Google Gemini API
 * P0-4 FIX: Safe JSON parsing
 */
export async function fetchGoogleModels(apiKey: string): Promise<FetchResult> {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        console.log('[fetchGoogleModels] Fetching from Google Gemini API');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return { success: false, error: 'API key tidak valid atau tidak punya akses.' };
            }
            if (response.status === 404) {
                return { success: false, error: 'Endpoint models tidak tersedia untuk Google.' };
            }
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const data = await safeJsonResponse(response);

        if (!data) {
            return { success: false, error: 'Google memberikan respons kosong.' };
        }

        if (!data.models || !Array.isArray(data.models) || data.models.length === 0) {
            return { success: false, error: 'Tidak ada model ditemukan dari Google.' };
        }

        console.log('[fetchGoogleModels] Success:', data.models.length, 'models');
        return { success: true, data };

    } catch (error: any) {
        console.error('[fetchGoogleModels] Error:', error);

        if (error.name === 'AbortError') {
            return { success: false, error: 'Request timeout. Coba lagi.' };
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return { success: false, error: 'Gagal menghubungi Google. Periksa koneksi server.' };
        }

        return { success: false, error: 'Gagal menghubungi Google.' };
    }
}

/**
 * Fetch models from Anthropic API
 * Note: Anthropic doesn't provide a public models endpoint, so this returns a predefined list
 */
export async function fetchAnthropicModels(apiKey: string): Promise<FetchResult> {
    const knownModels = [
        { id: 'claude-haiku-4-20250514', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-3-5-haiku-20241022', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-3-5-sonnet-20241022', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-sonnet-4-20250514', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-opus-4-20250514', object: 'model', created: Date.now() / 1000 },
    ];

    return {
        success: true,
        data: { object: 'list', data: knownModels },
    };
}

/**
 * Main dispatcher: Fetch models from any provider
 * P0-4 FIX: Better error messages and validation
 */
export async function fetchProviderModels(
    providerSlug: string,
    config: ProviderFetchConfig
): Promise<FetchResult> {
    console.log('[fetchProviderModels] Fetching models for provider:', providerSlug);

    // Validate API key
    if (!config.apiKey || config.apiKey.trim() === '') {
        return { success: false, error: 'API key tidak boleh kosong.' };
    }

    // Set default base URL for providers that need it
    let baseUrl = config.baseUrl;

    if (!baseUrl) {
        const defaultBaseUrls: Record<string, string> = {
            'openrouter': 'https://openrouter.ai/api/v1',
            'groq': 'https://api.groq.com/openai/v1',
            'deepseek': 'https://api.deepseek.com/v1',
            'kiro': 'https://api.kiro.ai/v1',
        };

        if (defaultBaseUrls[providerSlug]) {
            baseUrl = defaultBaseUrls[providerSlug];
            console.log(`[fetchProviderModels] Using default base URL for ${providerSlug}: ${baseUrl}`);
        }
    }

    switch (providerSlug) {
        case 'openai':
            return fetchOpenAIModels(config.apiKey);

        case 'google':
        case 'gemini':
            return fetchGoogleModels(config.apiKey);

        case 'anthropic':
            return fetchAnthropicModels(config.apiKey);

        case 'openai-compatible':
        case 'openrouter':
        case 'groq':
        case 'kiro':
            if (!baseUrl) {
                return { success: false, error: 'Base URL diperlukan untuk provider ini.' };
            }
            return fetchOpenAICompatibleModels(baseUrl, config.apiKey);

        case 'deepseek':
            if (!baseUrl) {
                return { success: false, error: 'Base URL diperlukan untuk provider ini.' };
            }
            // Try /models endpoint first; fall back to known models if unavailable
            const deepseekResult = await fetchOpenAICompatibleModels(baseUrl, config.apiKey);
            if (deepseekResult.success) return deepseekResult;

            console.warn('[fetchProviderModels] DeepSeek /models endpoint unavailable, using fallback models');
            return {
                success: true,
                data: {
                    object: 'list',
                    data: DEEPSEEK_FALLBACK_MODELS.map(m => ({
                        id: m.id,
                        object: 'model',
                        created: Date.now() / 1000,
                    })),
                },
            };

        default:
            if (baseUrl) {
                return fetchOpenAICompatibleModels(baseUrl, config.apiKey);
            }
            return { success: false, error: `Provider '${providerSlug}' tidak didukung.` };
    }
}
