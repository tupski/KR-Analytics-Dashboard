/**
 * lib/ai/insight.ts
 *
 * Server-side helpers for AI Insight caching, settings retrieval,
 * and config resolution.
 *
 * All functions use createServerClient() – do NOT import in client
 * components. Use the /api/ai/insight route instead.
 */

import { createServerClient } from '@/lib/supabase/server';
import { loadAllProviderConfigs } from '@/lib/ai/configServer';
import { createHash } from 'crypto';

// ── Cache Key ────────────────────────────────────────────────────────────────

export interface InsightCacheParams {
    page: string;
    rangePreset?: string;
    startDate?: string;
    endDate?: string;
    comparisonMode?: string;
    comparisonStartDate?: string;
    comparisonEndDate?: string;
    reportPeriodMode?: string;
    providerSlug?: string;
    modelId?: string;
}

/**
 * Compute a deterministic SHA-256 cache key from insight parameters.
 * Normalizes undefined values to empty string so the same params
 * always produce the same hash.
 */
export function getInsightCacheKey(params: InsightCacheParams): string {
    const raw = [
        params.page,
        params.rangePreset ?? '',
        params.startDate ?? '',
        params.endDate ?? '',
        params.comparisonMode ?? '',
        params.comparisonStartDate ?? '',
        params.comparisonEndDate ?? '',
        params.reportPeriodMode ?? '',
        params.providerSlug ?? '',
        params.modelId ?? '',
    ].join('|');

    return 'insight:' + createHash('sha256').update(raw, 'utf8').digest('hex');
}

// ── DB Cache Operations ─────────────────────────────────────────────────────

export interface CachedInsight {
    id: string;
    cache_key: string;
    page: string;
    response: any;
    generated_at: string;
    expires_at: string;
}

/**
 * Look up an unexpired cached insight by key.
 * Returns null if not found or expired.
 */
export async function getCachedInsight(
    cacheKey: string,
): Promise<CachedInsight | null> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('ai_insight_cache')
        .select('id, cache_key, page, response, generated_at, expires_at')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (error || !data) return null;
    return data as CachedInsight;
}

export interface SetCacheInput {
    cacheKey: string;
    page: string;
    response: any;
    ttlMinutes: number;
    providerSlug?: string;
    modelId?: string;
    reportPeriodMode?: string;
    rangeStart?: string;
    rangeEnd?: string;
    comparisonStart?: string;
    comparisonEnd?: string;
    inputHash?: string;
}

/**
 * Insert or update a cached insight entry.
 * Uses cache_key as the conflict target (upsert).
 */
export async function setCachedInsight(input: SetCacheInput): Promise<void> {
    const supabase = createServerClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60 * 1000);

    const record = {
        cache_key: input.cacheKey,
        page: input.page,
        provider_slug: input.providerSlug ?? null,
        model_id: input.modelId ?? null,
        report_period_mode: input.reportPeriodMode ?? null,
        range_start: input.rangeStart ?? null,
        range_end: input.rangeEnd ?? null,
        comparison_start: input.comparisonStart ?? null,
        comparison_end: input.comparisonEnd ?? null,
        input_hash: input.inputHash ?? null,
        response: input.response,
        generated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
    };

    const { error } = await supabase
        .from('ai_insight_cache')
        .upsert(record, { onConflict: 'cache_key' });

    if (error) {
        console.error('[insight] Failed to cache insight:', error.message);
    }
}

/**
 * Delete cached entries, optionally filtered by page.
 */
export async function clearInsightCache(page?: string): Promise<number> {
    const supabase = createServerClient();
    let query = supabase.from('ai_insight_cache').delete();

    if (page) {
        query = query.eq('page', page);
    }

    const { data, error } = await query.select('id');
    if (error) {
        console.error('[insight] Failed to clear cache:', error.message);
        return 0;
    }
    return data?.length ?? 0;
}

// ── AI Insight Settings from app_settings ────────────────────────────────────

export interface InsightSettings {
    enabled: boolean;
    mode: 'rule-based' | 'ai-generated' | 'ai-with-fallback';
    provider: string;
    model: string;
    cacheTtlMinutes: number;
    autoRefresh: boolean;
}

const DEFAULT_INSIGHT_SETTINGS: InsightSettings = {
    enabled: false,
    mode: 'ai-with-fallback',
    provider: '',
    model: '',
    cacheTtlMinutes: 30,
    autoRefresh: true,
};

/**
 * Read AI Insight settings from the app_settings table.
 * Returns defaults if no settings are stored.
 */
export async function getInsightSettings(): Promise<InsightSettings> {
    const supabase = createServerClient();

    const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
            'ai_insight_enabled',
            'ai_insight_mode',
            'ai_insight_provider',
            'ai_insight_model',
            'ai_insight_cache_ttl_minutes',
            'ai_insight_auto_refresh',
        ]);

    if (error || !data) {
        return { ...DEFAULT_INSIGHT_SETTINGS };
    }

    const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));

    return {
        enabled: map.ai_insight_enabled === 'true',
        mode: (map.ai_insight_mode as InsightSettings['mode']) ?? DEFAULT_INSIGHT_SETTINGS.mode,
        provider: map.ai_insight_provider ?? '',
        model: map.ai_insight_model ?? '',
        cacheTtlMinutes: parseInt(map.ai_insight_cache_ttl_minutes ?? String(DEFAULT_INSIGHT_SETTINGS.cacheTtlMinutes), 10),
        autoRefresh: map.ai_insight_auto_refresh === 'true',
    };
}

// ── Resolve Provider + Model for Insight ─────────────────────────────────────

export interface ResolvedInsightConfig {
    providerSlug: string;
    modelId: string;
    apiKey: string;
    baseUrl?: string;
}

/**
 * Resolve the provider+model to use for generating an insight.
 *
 * Strategy (first match wins):
 * 1. If insight settings specify both provider and model → use those
 * 2. Fallback to the active provider from ai_provider_configs (chat config)
 * 3. Fallback to the first configured provider
 *
 * Returns null if no provider is configured at all.
 */
export async function getAIConfigForInsight(): Promise<ResolvedInsightConfig | null> {
    const settings = await getInsightSettings();
    const allConfigs = await loadAllProviderConfigs();

    if (allConfigs.length === 0) return null;

    // 1. Insight-specific provider+model
    if (settings.provider && settings.model) {
        const match = allConfigs.find(
            (c) => c.providerId === settings.provider,
        );
        if (match) {
            return {
                providerSlug: match.providerId,
                modelId: settings.model,
                apiKey: match.apiKey,
                baseUrl: match.baseUrl,
            };
        }
    }

    // 2. Fallback to active (chat) provider
    const active = allConfigs.find((c) => c.isActive);
    if (active) {
        return {
            providerSlug: active.providerId,
            modelId: active.activeModel || active.model,
            apiKey: active.apiKey,
            baseUrl: active.baseUrl,
        };
    }

    // 3. First configured provider
    const first = allConfigs[0];
    return {
        providerSlug: first.providerId,
        modelId: first.model || first.activeModel || '',
        apiKey: first.apiKey,
        baseUrl: first.baseUrl,
    };
}
