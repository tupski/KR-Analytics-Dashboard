/**
 * API Routes for AI Provider Models
 *
 * GET /api/ai/models?provider=xxx - Get cached models from database
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { GetModelsResponse, ProviderModel } from '@/types/ai-models';

/**
 * GET /api/ai/models?provider=xxx
 *
 * Get cached models from database for a specific provider
 *
 * Query params:
 *   - provider: Provider slug (e.g., 'openai', 'google')
 *
 * Returns:
 *   - models: Array of ProviderModel
 *   - lastFetched: ISO timestamp of last fetch, or null
 *
 * Note: Auth check removed because middleware.ts already protects all /api/ai/* routes.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createServerClient();

        // Get provider from query params
        const searchParams = request.nextUrl.searchParams;
        const provider = searchParams.get('provider');

        if (!provider) {
            return NextResponse.json(
                { error: 'Provider parameter is required' },
                { status: 400 }
            );
        }

        // Fetch models from database
        const { data: models, error } = await supabase
            .from('ai_provider_models')
            .select('*')
            .eq('provider_slug', provider)
            .order('display_name', { ascending: true });

        if (error) {
            console.error('[GET /api/ai/models] Database error:', error);
            return NextResponse.json(
                { error: 'Gagal mengambil data model dari database' },
                { status: 500 }
            );
        }

        // Convert database format to ProviderModel format
        const providerModels: ProviderModel[] = (models || []).map((row: any) => ({
            id: row.id,
            providerSlug: row.provider_slug,
            providerName: row.provider_name,
            modelId: row.model_id,
            displayName: row.display_name,
            enabled: row.enabled,
            isCustom: row.is_custom ?? false,
            isActive: row.is_active ?? true,
            capabilities: row.capabilities,
            pricing: row.pricing,
            raw: row.raw,
            lastFetchedAt: row.last_fetched_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));

        // Get last fetched timestamp
        const lastFetched = providerModels.length > 0
            ? providerModels[0].lastFetchedAt || null
            : null;

        const response: GetModelsResponse = {
            models: providerModels,
            lastFetched,
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('[GET /api/ai/models] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
