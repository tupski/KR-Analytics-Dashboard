/**
 * TypeScript types for AI Provider Models
 * 
 * These types define the structure for fetching, storing, and managing
 * AI models from various providers (OpenAI, Google, Anthropic, etc.)
 */

/**
 * Provider model as stored in the database (ai_provider_models table)
 */
export interface ProviderModel {
    id?: number;
    providerSlug: string;
    providerName: string;
    modelId: string;
    displayName: string;
    enabled: boolean;
    capabilities?: {
        vision?: boolean;
        streaming?: boolean;
        functionCalling?: boolean;
        reasoning?: boolean;
    };
    pricing?: {
        input?: number;
        output?: number;
        currency?: string;
    };
    raw: any;
    lastFetchedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Response from model fetching API
 */
export interface FetchModelsResponse {
    success: boolean;
    models: ProviderModel[];
    fetchedAt: string;
    error?: string;
}

/**
 * Response from GET /api/ai/models
 */
export interface GetModelsResponse {
    models: ProviderModel[];
    lastFetched: string | null;
}

/**
 * Response from PATCH /api/ai/models/[id]
 */
export interface UpdateModelResponse {
    success: boolean;
    model?: ProviderModel;
    error?: string;
}

/**
 * OpenAI-compatible models list response format
 * Used by OpenAI, OpenRouter, and other compatible providers
 */
export interface OpenAIModelsResponse {
    object: string;
    data: Array<{
        id: string;
        object: string;
        created?: number;
        owned_by?: string;
        permission?: any[];
        root?: string;
        parent?: string | null;
    }>;
}

/**
 * Google Gemini models list response format
 */
export interface GoogleModelsResponse {
    models?: Array<{
        name: string;
        displayName?: string;
        description?: string;
        supportedGenerationMethods?: string[];
        inputTokenLimit?: number;
        outputTokenLimit?: number;
    }>;
}

/**
 * Generic fallback response formats
 */
export type GenericModelsResponse =
    | { models: any[] }
    | any[]
    | { data: { models: any[] } };

/**
 * Provider configuration for fetching models
 */
export interface ProviderFetchConfig {
    baseUrl?: string;
    apiKey: string;
}

/**
 * Result from fetching models from a provider
 */
export interface FetchResult {
    success: boolean;
    data?: any;
    error?: string;
}
