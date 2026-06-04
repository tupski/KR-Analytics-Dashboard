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
    streamProviderResponse,
} from '@/lib/ai/providerAdapter';
import { parseAIResponse } from '@/lib/ai/responseParser';
import { buildInsightSystemPrompt } from '@/lib/ai/krai-system-prompt';
import { normalizeAiText } from '@/lib/ai/normalizeAiText';
import { createNDJSONResponse, type NDJSONStreamWriter } from '@/lib/ai/streamHelpers';
import { parseKraiResponse } from '@/lib/ai/kraiResponseParser';

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
        const body: InsightRequestBody & { stream?: boolean } = await request.json();
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
            stream,
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
                // If streaming requested, emit cached data as NDJSON (all at once)
                if (stream === true) {
                    return emitCachedInsightStream(cached.response);
                }
                return NextResponse.json({
                    cached: true,
                    response: cached.response,
                    generated_at: cached.generated_at,
                    expires_at: cached.expires_at,
                });
            }
        }

        // ── 4. Generate insight via AI ─────────────────────────────
        // If streaming requested, use streaming path
        if (stream === true) {
            return createNDJSONResponse(async (writer) => {
                try {
                    const systemContent = buildInsightSystemPrompt(page, dataSummary, withCompare);
                    await streamInsight(writer, aiConfig, systemContent, cacheKey, page, settings, {
                        reportPeriodMode,
                        rangeStart: startDate,
                        rangeEnd: endDate,
                        comparisonStart: comparisonStartDate,
                        comparisonEnd: comparisonEndDate,
                    });
                } catch (aiError: any) {
                    console.error('[ai/insight] Stream generation failed:', aiError.message);
                    // Try rule-based fallback
                    const fallbackText = generateFallbackInsight(page, dataSummary);
                    if (fallbackText) {
                        writer.writeAnswer(fallbackText);
                        writer.writeDone('stop');
                        return;
                    }
                    writer.writeError(aiError.message || 'Gagal menghasilkan insight');
                    writer.writeDone('error');
                }
            });
        }

        // ── Non-streaming path ─────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════════════
// STREAMING HELPERS — NDJSON insight generation
// ════════════════════════════════════════════════════════════════════════════

interface CacheMeta {
    reportPeriodMode?: string;
    rangeStart?: string;
    rangeEnd?: string;
    comparisonStart?: string;
    comparisonEnd?: string;
}

/**
 * Stream insight generation via provider streaming.
 * Writes thinking/answer/usage/done events.
 */
async function streamInsight(
    writer: NDJSONStreamWriter,
    cfg: { providerSlug: string; apiKey: string; modelId: string; baseUrl?: string },
    systemContent: string,
    cacheKey: string,
    page: string,
    settings: { cacheTtlMinutes?: number },
    cacheMeta: CacheMeta,
): Promise<void> {
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
        stream: true,
    });

    let answerAccumulator = '';
    let usageData: Record<string, unknown> | undefined;

    try {
        for await (const chunk of streamProviderResponse(
            cfg.providerSlug,
            cfg.modelId,
            cfg.apiKey,
            cfg.baseUrl,
            body,
        )) {
            if (chunk.thinkingDelta) {
                writer.writeThinking(chunk.thinkingDelta);
            }
            if (chunk.contentDelta) {
                answerAccumulator += chunk.contentDelta;
                writer.writeAnswer(chunk.contentDelta);
            }
            if (chunk.usage) {
                usageData = chunk.usage;
            }
            if (chunk.done) break;
        }
    } catch {
        // If streaming fails, fall back to non-streaming with parseKraiResponse
        const result = await callProviderForInsight(cfg, systemContent);
        const parsed = parseKraiResponse(result.message);
        if (parsed.thinking) {
            writer.writeThinking(parsed.thinking);
        }
        writer.writeAnswer(parsed.answer);
        if (result.usage) {
            writer.writeUsage(result.usage as Record<string, unknown>);
        }
        writer.writeDone(parsed.finishReason || 'stop', parsed.isTruncated);

        // Cache the result
        const responseData = {
            message: parsed.answer,
            model: cfg.modelId,
            provider: cfg.providerSlug,
            usage: result.usage,
            fallback: false,
        };
        await setCachedInsight({
            cacheKey,
            page,
            response: responseData,
            ttlMinutes: settings.cacheTtlMinutes || 30,
            providerSlug: cfg.providerSlug,
            modelId: cfg.modelId,
            reportPeriodMode: cacheMeta.reportPeriodMode,
            rangeStart: cacheMeta.rangeStart,
            rangeEnd: cacheMeta.rangeEnd,
            comparisonStart: cacheMeta.comparisonStart,
            comparisonEnd: cacheMeta.comparisonEnd,
        }).catch(() => { });
        return;
    }

    // Normalize the accumulated text
    const normalizedAnswer = normalizeAiText(answerAccumulator);

    // If answer is empty/unusable, try parseKraiResponse for structured extraction
    if (!normalizedAnswer || normalizedAnswer.length < 10) {
        // Try parsing the raw accumulated text
        const parsed = parseKraiResponse(answerAccumulator);
        const finalAnswer = parsed.answer || answerAccumulator || 'Insight tidak tersedia.';
        writer.writeAnswer(finalAnswer);
        if (usageData) writer.writeUsage(usageData);
        writer.writeDone(parsed.finishReason || 'stop', parsed.isTruncated);

        // Still cache what we got
        const responseData = {
            message: finalAnswer,
            model: cfg.modelId,
            provider: cfg.providerSlug,
            usage: usageData,
            fallback: false,
        };
        await setCachedInsight({
            cacheKey,
            page,
            response: responseData,
            ttlMinutes: settings.cacheTtlMinutes || 30,
            providerSlug: cfg.providerSlug,
            modelId: cfg.modelId,
            reportPeriodMode: cacheMeta.reportPeriodMode,
            rangeStart: cacheMeta.rangeStart,
            rangeEnd: cacheMeta.rangeEnd,
            comparisonStart: cacheMeta.comparisonStart,
            comparisonEnd: cacheMeta.comparisonEnd,
        }).catch(() => { });
        return;
    }

    // Final successful answer — emit last events and cache
    if (usageData) {
        writer.writeUsage(usageData);
    }
    writer.writeDone('stop');

    // Cache the final parsed result
    const responseData = {
        message: normalizedAnswer,
        model: cfg.modelId,
        provider: cfg.providerSlug,
        usage: usageData,
        fallback: false,
    };
    await setCachedInsight({
        cacheKey,
        page,
        response: responseData,
        ttlMinutes: settings.cacheTtlMinutes || 30,
        providerSlug: cfg.providerSlug,
        modelId: cfg.modelId,
        reportPeriodMode: cacheMeta.reportPeriodMode,
        rangeStart: cacheMeta.rangeStart,
        rangeEnd: cacheMeta.rangeEnd,
        comparisonStart: cacheMeta.comparisonStart,
        comparisonEnd: cacheMeta.comparisonEnd,
    }).catch(() => { });
}

/**
 * Emit cached insight as NDJSON (all at once, no real-time since cached).
 */
function emitCachedInsightStream(cachedResponse: any): Response {
    return createNDJSONResponse(async (writer) => {
        const message = cachedResponse?.message || 'Insight tersimpan.';
        const usage = cachedResponse?.usage;
        writer.writeAnswer(message);
        if (usage) {
            writer.writeUsage(usage);
        }
        writer.writeDone('stop');
    });
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


