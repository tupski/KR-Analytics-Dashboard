/**
 * API Route for fetching AI Provider Models from provider API
 *
 * POST /api/ai/fetch-models - Fetch models from provider API and store in database
 *
 * Moved from /api/ai/models/fetch to resolve Next.js App Router route conflict
 * with [id] dynamic segment (which only exports PATCH).
 * Middleware.ts already protects all /api/ai/* routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { fetchProviderModels } from '@/lib/ai/modelFetcher';
import { normalizeModels } from '@/lib/ai/modelNormalizer';
import { decryptApiKey } from '@/lib/ai/configServer';
import type { FetchModelsResponse } from '@/types/ai-models';

/**
 * POST /api/ai/fetch-models
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

            // Validate decrypted key is not empty
            if (!apiKey || apiKey.trim().length === 0) {
                throw new Error('Decrypted API key is empty');
            }
        } catch (error) {
            console.error('[POST /api/ai/fetch-models] Decryption error:', error);

            // Check if this might be a key format issue
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('authenticate') || errorMsg.includes('Unsupported state')) {
                return NextResponse.json(
                    {
                        error: 'API key tidak dapat didekripsi. Kemungkinan encryption key telah berubah atau data rusak. Silakan atur ulang API key untuk provider ini.',
                        needsReconfiguration: true,
                        providerId: providerId
                    },
                    { status: 500 }
                );
            }

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

        // Store models in database: delete non-custom models, insert fresh fetched ones
        // This preserves any custom models (is_custom = true) that user added manually.
        const now = new Date().toISOString();

        // 1. Delete all non-custom models for this provider
        const { error: deleteError } = await supabase
            .from('ai_provider_models')
            .delete()
            .eq('provider_slug', providerId)
            .eq('is_custom', false);

        if (deleteError) {
            console.error('[POST /api/ai/fetch-models] Delete error:', deleteError);
            return NextResponse.json({
                success: false,
                models: [],
                fetchedAt: now,
                error: 'Gagal membersihkan model lama.',
            } as FetchModelsResponse);
        }

        // 2. Insert freshly fetched models
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
            is_custom: false,
        }));

        const { error: insertError } = await supabase
            .from('ai_provider_models')
            .insert(dbRecords);

        if (insertError) {
            console.error('[POST /api/ai/fetch-models] Insert error:', insertError);
            return NextResponse.json({
                success: false,
                models: [],
                fetchedAt: now,
                error: 'Gagal menyimpan model ke database.',
            } as FetchModelsResponse);
        }

        console.log(`[POST /api/ai/fetch-models] Successfully stored ${normalizedModels.length} models for ${providerId}`);

        return NextResponse.json({
            success: true,
            models: normalizedModels,
            fetchedAt: now,
        } as FetchModelsResponse);

    } catch (error: any) {
        console.error('[POST /api/ai/fetch-models] Error:', error);
        return NextResponse.json({
            success: false,
            models: [],
            fetchedAt: new Date().toISOString(),
            error: error.message || 'Internal server error',
        } as FetchModelsResponse);
    }
}
