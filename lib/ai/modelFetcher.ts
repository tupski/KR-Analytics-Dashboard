/**
 * Model Fetcher
 * 
 * Fetches available models from various AI provider APIs.
 * Handles provider-specific endpoints and error cases.
 * 
 * SECURITY: This module runs server-side only. API keys are never exposed to the client.
 */

import type { FetchResult, ProviderFetchConfig } from '@/types/ai-models';

const FETCH_TIMEOUT = 10000; // 10 seconds

/**
 * Fetch models from OpenAI Compatible endpoint
 * Used by: OpenRouter, Together AI, Fireworks, Ollama, etc.
 * 
 * @param baseUrl - Base URL of the API (e.g., "https://api.together.xyz/v1")
 * @param apiKey - API key for authentication
 * @returns FetchResult with models data or error
 */
export async function fetchOpenAICompatibleModels(
    baseUrl: string,
    apiKey: string
): Promise<FetchResult> {
    try {
        // Normalize base URL (remove trailing slash)
        const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
        const url = `${normalizedBaseUrl}/models`;

        console.log(`[fetchOpenAICompatibleModels] Fetching from: ${url}`);

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
                return {
                    success: false,
                    error: 'API key tidak valid atau tidak punya akses.',
                };
            }
            if (response.status === 404) {
                return {
                    success: false,
                    error: 'Endpoint /models tidak tersedia untuk provider ini.',
                };
            }
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
            };
        }

        const data = await response.json();

        // Check if response has models
        if (!data || (Array.isArray(data) && data.length === 0)) {
            return {
                success: false,
                error: 'Tidak ada model ditemukan dari provider ini.',
            };
        }

        if (data.data && Array.isArray(data.data) && data.data.length === 0) {
            return {
                success: false,
                error: 'Tidak ada model ditemukan dari provider ini.',
            };
        }

        console.log(`[fetchOpenAICompatibleModels] Success: ${data.data?.length || 0} models`);
        return { success: true, data };

    } catch (error: any) {
        console.error('[fetchOpenAICompatibleModels] Error:', error);

        if (error.name === 'AbortError') {
            return {
                success: false,
                error: 'Request timeout. Coba lagi.',
            };
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return {
                success: false,
                error: 'Gagal menghubungi provider. Periksa Base URL dan koneksi server.',
            };
        }

        return {
            success: false,
            error: error.message || 'Gagal menghubungi provider. Periksa Base URL dan koneksi server.',
        };
    }
}

/**
 * Fetch models from official OpenAI API
 * 
 * @param apiKey - OpenAI API key
 * @returns FetchResult with models data or error
 */
export async function fetchOpenAIModels(apiKey: string): Promise<FetchResult> {
    const baseUrl = 'https://api.openai.com/v1';
    return fetchOpenAICompatibleModels(baseUrl, apiKey);
}

/**
 * Fetch models from Google Gemini API
 * 
 * @param apiKey - Google API key
 * @returns FetchResult with models data or error
 */
export async function fetchGoogleModels(apiKey: string): Promise<FetchResult> {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        console.log('[fetchGoogleModels] Fetching from Google Gemini API');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle HTTP errors
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return {
                    success: false,
                    error: 'API key tidak valid atau tidak punya akses.',
                };
            }
            if (response.status === 404) {
                return {
                    success: false,
                    error: 'Endpoint /models tidak tersedia untuk provider ini.',
                };
            }
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
            };
        }

        const data = await response.json();

        // Check if response has models
        if (!data || !data.models || data.models.length === 0) {
            return {
                success: false,
                error: 'Tidak ada model ditemukan dari provider ini.',
            };
        }

        console.log(`[fetchGoogleModels] Success: ${data.models.length} models`);
        return { success: true, data };

    } catch (error: any) {
        console.error('[fetchGoogleModels] Error:', error);

        if (error.name === 'AbortError') {
            return {
                success: false,
                error: 'Request timeout. Coba lagi.',
            };
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return {
                success: false,
                error: 'Gagal menghubungi provider. Periksa Base URL dan koneksi server.',
            };
        }

        return {
            success: false,
            error: error.message || 'Gagal menghubungi provider.',
        };
    }
}

/**
 * Fetch models from Anthropic API
 * Note: Anthropic doesn't provide a public models endpoint, so this returns a predefined list
 * 
 * @param apiKey - Anthropic API key (validated but not used for fetching)
 * @returns FetchResult with predefined models
 */
export async function fetchAnthropicModels(apiKey: string): Promise<FetchResult> {
    // Anthropic doesn't have a public /models endpoint
    // Return a predefined list of known models
    const knownModels = [
        { id: 'claude-haiku-4-20250514', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-3-5-haiku-20241022', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-3-5-sonnet-20241022', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-sonnet-4-20250514', object: 'model', created: Date.now() / 1000 },
        { id: 'claude-opus-4-20250514', object: 'model', created: Date.now() / 1000 },
    ];

    return {
        success: true,
        data: {
            object: 'list',
            data: knownModels,
        },
    };
}

/**
 * Main dispatcher: Fetch models from any provider
 * 
 * @param providerSlug - Provider identifier (e.g., 'openai', 'google', 'openai-compatible')
 * @param config - Provider configuration (baseUrl, apiKey)
 * @returns FetchResult with models data or error
 */
export async function fetchProviderModels(
    providerSlug: string,
    config: ProviderFetchConfig
): Promise<FetchResult> {
    console.log(`[fetchProviderModels] Fetching models for provider: ${providerSlug}`);

    // Validate API key
    if (!config.apiKey || config.apiKey.trim() === '') {
        return {
            success: false,
            error: 'API key tidak boleh kosong.',
        };
    }

    // Route to appropriate fetcher based on provider
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
        case 'deepseek':
        case 'kiro':
            if (!config.baseUrl) {
                return {
                    success: false,
                    error: 'Base URL diperlukan untuk provider ini.',
                };
            }
            return fetchOpenAICompatibleModels(config.baseUrl, config.apiKey);

        default:
            // Try OpenAI-compatible as fallback
            if (config.baseUrl) {
                return fetchOpenAICompatibleModels(config.baseUrl, config.apiKey);
            }
            return {
                success: false,
                error: `Provider '${providerSlug}' tidak didukung.`,
            };
    }
}
