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
import { normalizeOpenAICompatibleBaseUrl } from '@/lib/ai/providerAdapter';
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

        // Store models in database: insert freshly fetched models first,
        // then clean up stale non-custom models that are no longer in the
        // new fetched set. This preserves custom models (is_custom = true).
        // Cleanup is non-blocking — failure logs a warning, not an error.
        const now = new Date().toISOString();

        // 1. Upsert fetched models (insert or update on model_id conflict)
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
            .upsert(dbRecords, { onConflict: 'provider_slug,model_id' });

        if (insertError) {
            console.error('[POST /api/ai/fetch-models] Upsert error:', insertError);
            return NextResponse.json({
                success: false,
                models: [],
                fetchedAt: now,
                error: 'Gagal menyimpan model ke database.',
            } as FetchModelsResponse);
        }

        // 2. Clean up stale non-custom models (those no longer returned by provider).
        //    This is non-blocking: only models NOT in the newly fetched set are removed.
        let cleanupError: Error | null = null;
        let cleanupSkipped = false;
        try {
            const newModelIds = normalizedModels.map((m) => m.modelId);
            const { error: deleteError } = await supabase
                .from('ai_provider_models')
                .delete()
                .eq('provider_slug', providerId)
                .eq('is_custom', false)
                .not('model_id', 'in', `(${newModelIds.join(',')})`);

            if (deleteError) {
                cleanupError = new Error(deleteError.message);
            }
        } catch (err) {
            cleanupError = err instanceof Error ? err : new Error(String(err));
        }

        if (cleanupError) {
            console.warn('[POST /api/ai/fetch-models] Cleanup warning (non-blocking):', cleanupError.message);
        }

        // 3. Debug log
        console.debug('[AI Models Fetch]', {
            provider: providerId,
            baseUrl: configData.base_url,
            normalizedBaseUrl: configData.base_url
                ? (() => { try { return normalizeOpenAICompatibleBaseUrl(configData.base_url); } catch { return configData.base_url; } })()
                : undefined,
            fetchedCount: normalizedModels.length,
            upsertedCount: normalizedModels.length,
            cleanupSkipped,
            cleanupError: cleanupError?.message,
        });

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
