/**
 * Client-side API functions for AI model management
 * 
 * These functions call the backend API endpoints for fetching,
 * retrieving, and updating AI provider models.
 */

import type { FetchModelsResponse, GetModelsResponse, UpdateModelResponse } from '@/types/ai-models';

/**
 * Fetch models from provider API and store in database
 * 
 * @param providerId - Provider slug (e.g., 'openai', 'google', 'anthropic')
 * @returns Response with fetched models and timestamp
 */
export async function fetchModels(providerId: string): Promise<FetchModelsResponse> {
    try {
        const response = await fetch('/api/ai/fetch-models', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ providerId }),
        });

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                models: [],
                fetchedAt: new Date().toISOString(),
                error: error.error || `Gagal mengambil model: ${response.status}`,
            };
        }

        const data: FetchModelsResponse = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            models: [],
            fetchedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Terjadi kesalahan saat mengambil model',
        };
    }
}

/**
 * Get cached models from database
 * 
 * @param providerId - Provider slug (e.g., 'openai', 'google', 'anthropic')
 * @returns Response with cached models and last fetch timestamp
 */
export async function getModels(providerId: string): Promise<GetModelsResponse> {
    try {
        const response = await fetch(`/api/ai/models?provider=${encodeURIComponent(providerId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Gagal memuat model: ${response.status}`);
        }

        const data: GetModelsResponse = await response.json();
        return data;
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat model');
    }
}

/**
 * Update model enabled status
 * 
 * @param modelId - Database ID of the model
 * @param enabled - Whether the model should be enabled
 * @returns Response with updated model
 */
export async function updateModel(modelId: number, enabled: boolean): Promise<UpdateModelResponse> {
    try {
        const response = await fetch(`/api/ai/models/${modelId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ enabled }),
        });

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                error: error.error || `Gagal memperbarui model: ${response.status}`,
            };
        }

        const data: UpdateModelResponse = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Terjadi kesalahan saat memperbarui model',
        };
    }
}
