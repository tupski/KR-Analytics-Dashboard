/**
 * Model Normalizer
 * 
 * Converts various provider response formats to our standard ProviderModel format.
 * Handles OpenAI-compatible, Google Gemini, and fallback formats.
 */

import type { ProviderModel, OpenAIModelsResponse, GoogleModelsResponse } from '@/types/ai-models';

/**
 * Normalize models from various provider response formats to standard ProviderModel format
 * 
 * @param rawResponse - Raw API response from provider
 * @param providerSlug - Provider identifier (e.g., 'openai', 'google', 'openai-compatible')
 * @param providerName - Human-readable provider name (e.g., 'OpenAI', 'Google Gemini')
 * @returns Array of normalized ProviderModel objects
 */
export function normalizeModels(
    rawResponse: any,
    providerSlug: string,
    providerName: string
): ProviderModel[] {
    if (!rawResponse) {
        console.warn('[normalizeModels] Empty response received');
        return [];
    }

    let models: any[] = [];

    // Try OpenAI-compatible format: { object: "list", data: [...] }
    if (rawResponse.object === 'list' && Array.isArray(rawResponse.data)) {
        models = rawResponse.data;
    }
    // Try Google Gemini format: { models: [...] }
    else if (Array.isArray(rawResponse.models)) {
        models = rawResponse.models;
    }
    // Try direct array format: [...]
    else if (Array.isArray(rawResponse)) {
        models = rawResponse;
    }
    // Try nested format: { data: { models: [...] } }
    else if (rawResponse.data && Array.isArray(rawResponse.data.models)) {
        models = rawResponse.data.models;
    }
    // Try simple wrapper: { models: [...] }
    else if (rawResponse.models && Array.isArray(rawResponse.models)) {
        models = rawResponse.models;
    }
    else {
        console.warn('[normalizeModels] Unknown response format:', rawResponse);
        return [];
    }

    // Normalize each model
    return models
        .map((model) => normalizeModel(model, providerSlug, providerName))
        .filter((model): model is ProviderModel => model !== null);
}

/**
 * Normalize a single model from provider format to ProviderModel
 */
function normalizeModel(
    rawModel: any,
    providerSlug: string,
    providerName: string
): ProviderModel | null {
    if (!rawModel) return null;

    // Extract model ID (different field names across providers)
    const modelId = extractModelId(rawModel);
    if (!modelId) {
        console.warn('[normalizeModel] No model ID found:', rawModel);
        return null;
    }

    // Extract display name
    const displayName = extractDisplayName(rawModel, modelId);

    // Infer capabilities from model name and metadata
    const capabilities = inferCapabilities(modelId, rawModel);

    // Extract pricing if available
    const pricing = extractPricing(rawModel);

    return {
        providerSlug,
        providerName,
        modelId,
        displayName,
        enabled: true, // Default to enabled
        capabilities,
        pricing,
        raw: rawModel,
        lastFetchedAt: new Date().toISOString(),
    };
}

/**
 * Extract model ID from various provider formats
 */
function extractModelId(model: any): string | null {
    // OpenAI format: { id: "gpt-4" }
    if (model.id) return model.id;

    // Google format: { name: "models/gemini-pro" }
    if (model.name) {
        // Strip "models/" prefix if present
        return model.name.replace(/^models\//, '');
    }

    // Fallback: check for model_id, modelId, model
    return model.model_id || model.modelId || model.model || null;
}

/**
 * Extract display name from model data
 */
function extractDisplayName(model: any, modelId: string): string {
    // Google format has displayName field
    if (model.displayName) return model.displayName;

    // Use description if available
    if (model.description && model.description.length < 100) {
        return model.description;
    }

    // Fallback: format model ID into readable name
    return formatModelIdAsDisplayName(modelId);
}

/**
 * Format model ID into a human-readable display name
 * Examples:
 *   "gpt-4-turbo" -> "GPT-4 Turbo"
 *   "claude-3-opus-20240229" -> "Claude 3 Opus"
 *   "gemini-pro" -> "Gemini Pro"
 */
function formatModelIdAsDisplayName(modelId: string): string {
    return modelId
        .replace(/^models\//, '') // Remove "models/" prefix
        .replace(/-\d{8}$/, '') // Remove date suffix (e.g., -20240229)
        .split(/[-_]/) // Split on hyphens and underscores
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize
        .join(' ');
}

/**
 * Infer model capabilities from model name and metadata
 */
function inferCapabilities(modelId: string, rawModel: any): ProviderModel['capabilities'] {
    const idLower = modelId.toLowerCase();

    const capabilities: ProviderModel['capabilities'] = {
        vision: false,
        streaming: true, // Most modern models support streaming
        functionCalling: false,
        reasoning: false,
    };

    // Vision capability
    if (
        idLower.includes('vision') ||
        idLower.includes('gpt-4o') ||
        idLower.includes('gpt-4-turbo') ||
        idLower.includes('claude-3') ||
        idLower.includes('claude-4') ||
        idLower.includes('gemini') ||
        idLower.includes('llama-3.2')
    ) {
        capabilities.vision = true;
    }

    // Reasoning capability (chain-of-thought models)
    if (
        idLower.includes('o1') ||
        idLower.includes('o3') ||
        idLower.includes('reasoning') ||
        idLower.includes('reasoner') ||
        idLower.includes('deepseek-r1') ||
        idLower.includes('gemini-2.5-pro')
    ) {
        capabilities.reasoning = true;
    }

    // Function calling capability
    if (
        idLower.includes('gpt-4') ||
        idLower.includes('gpt-3.5') ||
        idLower.includes('claude') ||
        idLower.includes('gemini') ||
        idLower.includes('deepseek') ||
        idLower.includes('llama-3') ||
        idLower.includes('mixtral') ||
        rawModel.supportedGenerationMethods?.includes('generateContent')
    ) {
        capabilities.functionCalling = true;
    }

    // Check raw model metadata for explicit capability flags
    if (rawModel.capabilities) {
        if (rawModel.capabilities.vision !== undefined) {
            capabilities.vision = rawModel.capabilities.vision;
        }
        if (rawModel.capabilities.functionCalling !== undefined) {
            capabilities.functionCalling = rawModel.capabilities.functionCalling;
        }
        if (rawModel.capabilities.reasoning !== undefined) {
            capabilities.reasoning = rawModel.capabilities.reasoning;
        }
    }

    return capabilities;
}

/**
 * Extract pricing information from model metadata
 */
function extractPricing(model: any): ProviderModel['pricing'] | undefined {
    // Check if pricing info is available in raw model
    if (model.pricing) {
        return {
            input: model.pricing.input || model.pricing.inputTokens,
            output: model.pricing.output || model.pricing.outputTokens,
            currency: model.pricing.currency || 'USD',
        };
    }

    // Some providers include pricing in different fields
    if (model.inputPrice !== undefined || model.outputPrice !== undefined) {
        return {
            input: model.inputPrice,
            output: model.outputPrice,
            currency: 'USD',
        };
    }

    return undefined;
}
