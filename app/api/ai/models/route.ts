/**
 * API Routes for AI Provider Models
 * 
 * GET /api/ai/models?provider=xxx - Get cached models from database
 * POST /api/ai/models/fetch - Fetch models from provider API and store in database
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { fetchProviderModels } from '@/lib/ai/modelFetcher';
import { normalizeModels } from '@/lib/ai/modelNormalizer';
import { decryptApiKey } from '@/lib/ai/configServer';
import type { FetchModelsResponse, GetModelsResponse, ProviderModel } from '@/types/ai-models';

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
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createServerClient();

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

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

/**
 * POST /api/ai/models/fetch
 * 
 * Fetch models from provider API and store in database
 * 
 * Request body:
 *   - providerId: Provider slug (e.g., 'openai', 'google')
 * 
 * Returns:
 *   - success: boolean
 *   - models: Array of ProviderModel
 *   - fetchedAt: ISO timestamp
 *   - error?: string
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = createServerClient();

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { providerId } = body;

        if (!providerId) {
            return NextResponse.json(
                { error: 'providerId is required' },
                { status: 400 }
            );
        }

        // Validate provider slug against whitelist
        const validProviders = [
            'openai',
            'anthropic',
            'google',
            'gemini',
            'deepseek',
            'groq',
            'openrouter',
            'kiro',
            'openai-compatible',
        ];

        if (!validProviders.includes(providerId)) {
            return NextResponse.json(
                { error: `Provider '${providerId}' tidak didukung` },
                { status: 400 }
            );
        }

        // Get provider config from database
        const { data: configData, error: configError } = await supabase
            .from('ai_provider_configs')
            .select('provider_id, api_key_enc, api_key_iv, base_url')
            .eq('scope', 'global')
            .eq('provider_id', providerId)
            .single();

        if (configError || !configData) {
            return NextResponse.json(
                { error: 'Konfigurasi provider tidak ditemukan. Silakan atur API key terlebih dahulu.' },
                { status: 404 }
            );
        }

        // Decrypt API key
        let apiKey: string;
        try {
            apiKey = decryptApiKey(configData.api_key_enc, configData.api_key_iv);
        } catch (error) {
            console.error('[POST /api/ai/models/fetch] Decryption error:', error);
            return NextResponse.json(
                { error: 'Gagal mendekripsi API key. Silakan atur ulang konfigurasi.' },
                { status: 500 }
            );
        }

        // Fetch models from provider API
        const fetchResult = await fetchProviderModels(providerId, {
            baseUrl: configData.base_url || undefined,
            apiKey,
        });

        if (!fetchResult.success) {
            return NextResponse.json({
                success: false,
                models: [],
                fetchedAt: new Date().toISOString(),
                error: fetchResult.error,
            } as FetchModelsResponse);
        }

        // Get provider name from models.ts or use providerId
        const providerNameMap: Record<string, string> = {
            'openai': 'OpenAI',
            'anthropic': 'Anthropic',
            'google': 'Google Gemini',
            'gemini': 'Google Gemini',
            'deepseek': 'DeepSeek',
            'groq': 'Groq',
            'openrouter': 'OpenRouter',
            'kiro': 'Kiro',
            'openai-compatible': 'OpenAI Compatible',
        };
        const providerName = providerNameMap[providerId] || providerId;

        // Normalize models
        const normalizedModels = normalizeModels(
            fetchResult.data,
            providerId,
            providerName
        );

        if (normalizedModels.length === 0) {
            return NextResponse.json({
                success: false,
                models: [],
                fetchedAt: new Date().toISOString(),
                error: 'Tidak ada model ditemukan dari provider ini.',
            } as FetchModelsResponse);
        }

        // Store models in database (upsert by provider_slug + model_id)
        const now = new Date().toISOString();
        const dbRecords = normalizedModels.map((model) => ({
            provider_slug: model.providerSlug,
            provider_name: model.providerName,
            model_id: model.modelId,
            display_name: model.displayName,
            enabled: model.enabled,
            capabilities: model.capabilities,
            pricing: model.pricing,
            raw: model.raw,
            last_fetched_at: now,
        }));

        const { error: upsertError } = await supabase
            .from('ai_provider_models')
            .upsert(dbRecords, {
                onConflict: 'provider_slug,model_id',
                ignoreDuplicates: false,
            });

        if (upsertError) {
            console.error('[POST /api/ai/models/fetch] Upsert error:', upsertError);
            return NextResponse.json({
                success: false,
                models: [],
                fetchedAt: now,
                error: 'Gagal menyimpan model ke database.',
            } as FetchModelsResponse);
        }

        console.log(`[POST /api/ai/models/fetch] Successfully stored ${normalizedModels.length} models for ${providerId}`);

        return NextResponse.json({
            success: true,
            models: normalizedModels,
            fetchedAt: now,
        } as FetchModelsResponse);

    } catch (error: any) {
        console.error('[POST /api/ai/models/fetch] Error:', error);
        return NextResponse.json({
            success: false,
            models: [],
            fetchedAt: new Date().toISOString(),
            error: error.message || 'Internal server error',
        } as FetchModelsResponse);
    }
}
