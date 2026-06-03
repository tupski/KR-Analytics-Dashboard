import { NextRequest, NextResponse } from 'next/server';
import {
    getInsightCacheKey,
    getCachedInsight,
    setCachedInsight,
    getInsightSettings,
    getAIConfigForInsight,
} from '@/lib/ai/insight';
import { generateFallbackInsight } from '@/lib/analytics/insights';
import {
    resolveProviderRequest,
    buildProviderBody,
    parseProviderResponse,
} from '@/lib/ai/providerAdapter';
import { parseAIResponse } from '@/lib/ai/responseParser';
import { buildInsightSystemPrompt } from '@/lib/ai/krai-system-prompt';
import { normalizeAiText } from '@/lib/ai/normalizeAiText';

/**
 * AI INSIGHT ROUTE — Lightweight, cacheable, no tool calling.
 *
 * Purpose: Generate/retrieve cached insights for dashboard cards.
 * Characteristics:
 * - No tool calling — pure text completion with provided data
 * - Cacheable — results stored in ai_insight_cache table
 * - Fast — no multi-turn loops, no streaming
 * - Used by: AIInsightCard, DashboardInsightSummary components
 *
 * This is NOT the KRAI chat route. For conversational AI with tool calling,
 * see app/api/ai/chat/route.ts
 */

/**
 * CACHE STRATEGY
 * ---------------
 * Goals: minimize AI provider calls, serve stale insights gracefully,
 *        survive provider outages.
 *
 * Layers:
 * 1. Primary cache (ai_insight_cache table) — keyed by page+params+provider+model.
 *    TTL configured per-insight in DB settings (default 30 min).
 * 2. Fallback cache — when AI call fails, rule-based fallback is cached at reduced
 *    TTL (5 min) so we retry AI quickly instead of serving stale data for 30 min.
 * 3. Inline fallback (no cache) — for validation errors / missing config;
 *    also uses 5 min TTL on the expires_at field.
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface InsightRequestBody {
    page: string;
    prompt: string;
    rangePreset?: string;
    startDate?: string;
    endDate?: string;
    comparisonMode?: string;
    comparisonStartDate?: string;
    comparisonEndDate?: string;
    reportPeriodMode?: string;
    title?: string;
    forceRefresh?: boolean;
    withCompare?: boolean;
    /** Structured data summary passed by each page for contextual insights */
    dataSummary?: Record<string, any>;
}

/**
 * POST /api/ai/insight
 *
 * Generates or retrieves cached AI insight.
 *
 * Flow:
 * 1. Compute cache_key from params
 * 2. Check ai_insight_cache for unexpired entry (skip if forceRefresh)
 * 3. If cached → return { cached: true, response, ... }
 * 4. If miss → load AI config, call provider (NO tool calling), store in cache, return
 * 5. On AI error → try rule-based fallback → generic message
 */
export async function POST(request: NextRequest) {
    try {
        const body: InsightRequestBody = await request.json();
        const {
            page,
            prompt,
            rangePreset,
            startDate,
            endDate,
            comparisonMode,
            comparisonStartDate,
            comparisonEndDate,
            reportPeriodMode,
            forceRefresh = false,
            withCompare = false,
            dataSummary,
        } = body;

        if (!page || !prompt) {
            return NextResponse.json(
                { error: 'page and prompt are required' },
                { status: 400 },
            );
        }

        // ── 0a. Prompt validation — never send empty request to provider ──
        if (!prompt.trim() || prompt.trim().length < 10) {
            console.warn('[ai/insight] Empty/short prompt — using rule-based fallback');
            const fallbackText = generateFallbackInsight(page, dataSummary);
            return NextResponse.json({
                cached: false,
                response: {
                    message: fallbackText || 'KRAI belum bisa membuat insight AI. Menampilkan insight rule-based.',
                    model: '',
                    provider: '',
                    fallback: true,
                },
                generated_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 300000).toISOString(),
            });
        }

        // ── 0. Load settings ──────────────────────────────────────
        const settings = await getInsightSettings();

        // If insight is disabled, return fallback immediately
        if (!settings.enabled) {
            const fallbackText = generateFallbackInsight(page, dataSummary);
            return NextResponse.json({
                cached: false,
                response: {
                    message: fallbackText,
                    model: '',
                    provider: '',
                    fallback: true,
                },
                generated_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 300000).toISOString(),
            });
        }

        // ── 1. Resolve provider + model ───────────────────────────
        const aiConfig = await getAIConfigForInsight();
        if (!aiConfig) {
            // No AI configured — use rule-based fallback
            const fallbackText = generateFallbackInsight(page, dataSummary);
            return NextResponse.json({
                cached: false,
                response: {
                    message: fallbackText,
                    model: '',
                    provider: '',
                    fallback: true,
                },
                generated_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 300000).toISOString(),
            });
        }

        // ── 2. Compute cache key ───────────────────────────────────
        const cacheKey = getInsightCacheKey({
            page,
            rangePreset,
            startDate,
            endDate,
            comparisonMode,
            comparisonStartDate,
            comparisonEndDate,
            reportPeriodMode,
            providerSlug: aiConfig.providerSlug,
            modelId: aiConfig.modelId,
        });

        // ── 3. Check cache (skip if forceRefresh) ──────────────────
        if (!forceRefresh) {
            const cached = await getCachedInsight(cacheKey);
            if (cached) {
                return NextResponse.json({
                    cached: true,
                    response: cached.response,
                    generated_at: cached.generated_at,
                    expires_at: cached.expires_at,
                });
            }
        }

        // ── 4. Generate insight via AI ─────────────────────────────
        try {
            const systemContent = buildInsightSystemPrompt(page, dataSummary, withCompare);

            const result = await callProviderForInsight(
                aiConfig,
                systemContent,
            );

            // Normalize AI text — strips JSON wrapping, extracts content recursively
            const message = result.message || '';
            const finalMessage = normalizeAiText(message);

            // If AI returned empty or unusable, fallback
            if (!finalMessage || finalMessage.length < 10) {
                throw new Error('AI returned empty response');
            }

            const responseData = {
                message: finalMessage,
                model: aiConfig.modelId,
                provider: aiConfig.providerSlug,
                usage: result.usage,
                fallback: false,
            };

            // ── 5. Save to cache ────────────────────────────────────
            await setCachedInsight({
                cacheKey,
                page,
                response: responseData,
                ttlMinutes: settings.cacheTtlMinutes || 30,
                providerSlug: aiConfig.providerSlug,
                modelId: aiConfig.modelId,
                reportPeriodMode: reportPeriodMode,
                rangeStart: startDate,
                rangeEnd: endDate,
                comparisonStart: comparisonStartDate,
                comparisonEnd: comparisonEndDate,
            });

            return NextResponse.json({
                cached: false,
                response: responseData,
                generated_at: new Date().toISOString(),
                expires_at: new Date(
                    Date.now() + (settings.cacheTtlMinutes || 30) * 60 * 1000,
                ).toISOString(),
            });
        } catch (aiError: any) {
            console.error('[ai/insight] AI generation failed:', aiError.message);

            // Try rule-based fallback
            const fallbackText = generateFallbackInsight(page, dataSummary);
            if (fallbackText) {
                const responseData = {
                    message: fallbackText,
                    model: '',
                    provider: '',
                    fallback: true,
                };
                // Cache fallback at short TTL (5 min) so AI retries soon
                await setCachedInsight({
                    cacheKey,
                    page,
                    response: responseData,
                    ttlMinutes: 5,
                    providerSlug: aiConfig.providerSlug,
                    modelId: aiConfig.modelId,
                    reportPeriodMode: reportPeriodMode,
                    rangeStart: startDate,
                    rangeEnd: endDate,
                    comparisonStart: comparisonStartDate,
                    comparisonEnd: comparisonEndDate,
                }).catch(() => { });

                return NextResponse.json({
                    cached: false,
                    response: responseData,
                    generated_at: new Date().toISOString(),
                    expires_at: new Date(
                        Date.now() + 5 * 60 * 1000,
                    ).toISOString(),
                });
            }

            // Last resort: generic message
            if (settings.mode === 'ai-with-fallback') {
                return NextResponse.json({
                    cached: false,
                    response: {
                        message: generateGenericFallback(page),
                        model: '',
                        provider: '',
                        fallback: true,
                    },
                });
            }

            return NextResponse.json(
                {
                    error: true,
                    fallback: false,
                    message: aiError.message || 'Gagal menghasilkan insight',
                },
                { status: 500 },
            );
        }
    } catch (err: any) {
        console.error('[ai/insight] Route error:', err.message);
        return NextResponse.json(
            { error: true, fallback: true, message: err.message },
            { status: 500 },
        );
    }
}

// ── System Prompt Builder — moved to lib/ai/krai-system-prompt.ts (shared) ───

// ── Provider calling logic (NO tools — direct text completion) ────────────────

async function callProviderForInsight(
    cfg: { providerSlug: string; apiKey: string; modelId: string; baseUrl?: string },
    systemContent: string,
): Promise<{ message: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    const { url, headers } = resolveProviderRequest(
        cfg.providerSlug,
        cfg.modelId,
        cfg.apiKey,
        cfg.baseUrl,
    );

    const body = buildProviderBody(cfg.providerSlug, cfg.modelId, {
        systemContent,
        maxTokens: 1024,
        temperature: 0.7,
    });

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API error: ${res.status} - ${errorText.substring(0, 300)}`);
    }

    const rawText = await res.text();

    // Parse response using centralized adapter
    const data = parseAIResponse(rawText);
    const parsed = parseProviderResponse(cfg.providerSlug, data);
    return parsed;
}

// ── Generic Fallback ─────────────────────────────────────────────────────────

function generateGenericFallback(page: string): string {
    const msgs: Record<string, string> = {
        dashboard: '**Ringkasan:** Data sedang dimuat. Silakan coba lagi dalam beberapa saat.\n\n**Rekomendasi:** Periksa koneksi database atau refresh halaman.',
        booking: '**Ringkasan:** Data booking belum tersedia.\n\n**Rekomendasi:** Silakan refresh halaman atau coba filter lain.',
        unit: '**Ringkasan:** Data unit belum tersedia.\n\n**Rekomendasi:** Periksa kembali filter yang dipilih.',
        customer: '**Ringkasan:** Data customer belum tersedia.\n\n**Rekomendasi:** Silakan coba kembali dalam beberapa saat.',
        laporan: '**Ringkasan:** Data laporan belum tersedia.\n\n**Rekomendasi:** Pastikan data transaksi dan pengeluaran sudah masuk.',
    };
    return msgs[page] || '**Ringkasan:** Data belum tersedia. Silakan coba lagi.';
}


