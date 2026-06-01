import { NextRequest, NextResponse } from 'next/server';
import {
    getInsightCacheKey,
    getCachedInsight,
    setCachedInsight,
    getInsightSettings,
    getAIConfigForInsight,
} from '@/lib/ai/insight';
import { createServerClient } from '@/lib/supabase/server';
import { loadAllProviderConfigs } from '@/lib/ai/configServer';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { generateFallbackInsight } from '@/lib/analytics/insights';

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
    /** Per-page context for insight relevance */
    pageContext?: {
        summary?: string;
        kpis?: Record<string, number>;
        topLocations?: Array<{ name: string; value: number }>;
        alerts?: string[];
    };
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
            pageContext,
            dataSummary,
        } = body;

        if (!page || !prompt) {
            return NextResponse.json(
                { error: 'page and prompt are required' },
                { status: 400 },
            );
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
                expires_at: new Date(Date.now() + 3600000).toISOString(),
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
                expires_at: new Date(Date.now() + 3600000).toISOString(),
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
            const systemContent = buildInsightSystemPrompt(page, dataSummary, prompt, withCompare);

            const result = await callProviderForInsight(
                aiConfig,
                systemContent,
            );

            // Validate we got natural language text, not JSON
            const message = result.message || '';
            const looksLikeJson = message.trim().startsWith('{') || message.trim().startsWith('[');

            let finalMessage = message;
            if (looksLikeJson) {
                // Try to extract useful content from JSON
                try {
                    const parsed = JSON.parse(message);
                    finalMessage = parsed.message || parsed.content || parsed.text || parsed.response || message;
                } catch {
                    // Not valid JSON either — use as-is
                    finalMessage = message;
                }
            }

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
                // Cache fallback too so we don't retry AI every time
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
                }).catch(() => { });

                return NextResponse.json({
                    cached: false,
                    response: responseData,
                    generated_at: new Date().toISOString(),
                    expires_at: new Date(
                        Date.now() + (settings.cacheTtlMinutes || 30) * 60 * 1000,
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

// ── System Prompt Builder ────────────────────────────────────────────────────

function buildInsightSystemPrompt(
    page: string,
    dataSummary?: Record<string, any>,
    userPrompt?: string,
    withCompare?: boolean,
): string {
    const pageLabels: Record<string, string> = {
        dashboard: 'Dashboard — Ringkasan Bisnis',
        booking: 'Booking — Data Pemesanan',
        unit: 'Unit — Performa Kamar & Okupansi',
        customer: 'Customer — Data Tamu & Pelanggan',
        laporan: 'Laporan — Keuangan & Pengeluaran',
    };

    const pageLabel = pageLabels[page] || page;

    // Serialize dataSummary for context
    let dataContext = '';
    if (dataSummary && Object.keys(dataSummary).length > 0) {
        try {
            const lines: string[] = [];
            for (const [key, val] of Object.entries(dataSummary)) {
                if (val === null || val === undefined) continue;
                if (Array.isArray(val)) {
                    if (val.length > 0) {
                        lines.push(`${key}: ${JSON.stringify(val.slice(0, 10))}${val.length > 10 ? ` (${val.length} items)` : ''}`);
                    }
                } else if (typeof val === 'object') {
                    lines.push(`${key}: ${JSON.stringify(val)}`);
                } else {
                    lines.push(`${key}: ${val}`);
                }
            }
            if (lines.length > 0) {
                dataContext = '\n\n## DATA HALAMAN SAAT INI\n' + lines.join('\n');
            }
        } catch { /* swallow serialization errors */ }
    }

    const compareSuffix = withCompare
        ? '\n\nLakukan analisis komparatif dengan periode sebelumnya. Jelaskan perubahan (naik/turun) dalam konteks bisnis.'
        : '';

    return `# KRAI - AI Business Copilot Kakarama Room

Kamu adalah KRAI, AI Business Copilot untuk Kakarama Room (bisnis penyewaan apartemen & kamar harian di Indonesia). Kamu adalah seorang Business Intelligence Analyst.

## Halaman Saat Ini: ${pageLabel}${dataContext}

## ATURAN WAJIB — BACA DENGAN SEKSAMA

1. ANDA HARUS menjawab dalam BAHASA INDONESIA natural language.
2. JANGAN output JSON, tool calls, kode, atau structured data APAPUN.
3. JANGAN menggunakan fungsi/tools — langsung analisis berdasarkan data yang diberikan.
4. Tulis dalam format paragraf seperti analis bisnis profesional.
5. Gunakan **bold** untuk angka penting jika perlu.
6. Struktur jawaban: Mulai dengan ringkasan, lalu analisis, lalu rekomendasi.
7. gunakan sub-heading sederhana: **Ringkasan:**, **Analisis:**, **Rekomendasi:**
8. Jangan hanya sebut angka — jelaskan makna bisnisnya.
9. Akhiri dengan 1-2 rekomendasi actionable spesifik.
10. Gunakan emoji yang relevan jika membantu (📈 💰 ⚠️ ✅ 🚨).

## PANDUAN KONTEN PER HALAMAN

**Dashboard**: Analisis KPI utama (pendapatan, booking, okupansi). Tren vs periode sebelumnya. Performa lokasi. Aktivitas operasional hari ini.

**Booking**: Volume booking dan tren. Perbandingan periode. Sumber/channel booking. Pola hari. Analisis durasi menginap.

**Unit**: Okupansi per lokasi. Unit dengan performa rendah/idle. Unit terisi vs tersedia. Rekomendasi alokasi.

**Customer**: Jumlah tamu unik. Rasio tamu baru vs kembali. Pola durasi menginap. Sumber kedatangan tamu.

**Laporan**: Ringkasan pendapatan vs pengeluaran. Kategori biaya terbesar. Laba/rugi. Analisis perbandingan periode.${compareSuffix}

INGAT: HANYA natural language text. TIDAK ADA JSON. TIDAK ADA tool calls.`;
}

// ── Provider calling logic (NO tools — direct text completion) ────────────────

async function callProviderForInsight(
    cfg: { providerSlug: string; apiKey: string; modelId: string; baseUrl?: string },
    systemContent: string,
): Promise<{ message: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    const { getEndpoint, getHeaders } = resolveProviderEndpoint(cfg);
    const { parseAIResponse } = await import('@/lib/ai/responseParser');

    const conversation = [
        { role: 'system', content: systemContent },
    ];

    const body = {
        model: cfg.modelId,
        messages: conversation,
        // NO tools — we want natural language text, not function calls
        temperature: 0.7,
        max_tokens: 1024,
    };

    const res = await fetch(getEndpoint, {
        method: 'POST',
        headers: getHeaders,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI API error: ${res.status} - ${errorText.substring(0, 300)}`);
    }

    const rawText = await res.text();
    let data: any;
    try {
        data = parseAIResponse(rawText);
    } catch {
        data = JSON.parse(rawText);
    }

    const choice = data?.choices?.[0];
    const message = choice?.message;

    if (!message) {
        if (data?.output_text) {
            return { message: data.output_text };
        }
        if (data?.content) {
            return { message: typeof data.content === 'string' ? data.content : JSON.stringify(data.content) };
        }
        throw new Error('Respons AI kosong.');
    }

    const usage = {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
    };

    return { message: message.content || 'Tidak ada respons.', usage };
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

// ── Provider endpoint resolution ─────────────────────────────────────────────

function resolveProviderEndpoint(cfg: { providerSlug: string; baseUrl?: string; apiKey: string; modelId: string }): {
    getEndpoint: string;
    getHeaders: Record<string, string>;
} {
    const PROVIDER_ENDPOINTS: Record<string, string> = {
        openai: 'https://api.openai.com/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/v1/chat/completions',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        kiro: '',
        anthropic: '',
        'openai-compatible': '',
    };

    let baseUrl = cfg.baseUrl || PROVIDER_ENDPOINTS[cfg.providerSlug] || '';
    if (cfg.providerSlug === 'openrouter') {
        if (baseUrl.endsWith('/v1')) baseUrl = `${baseUrl}/chat/completions`;
        return {
            getEndpoint: baseUrl,
            getHeaders: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cfg.apiKey}`,
                'HTTP-Referer': 'https://kakarama.com',
                'X-Title': 'KR Analytics',
            },
        };
    }

    if (cfg.providerSlug === 'kiro') {
        if (!cfg.baseUrl) throw new Error('Base URL Kiro belum dikonfigurasi.');
        return {
            getEndpoint: cfg.baseUrl,
            getHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        };
    }

    if (cfg.providerSlug === 'anthropic') {
        throw new Error('Anthropic provider not supported for insight generation directly.');
    }

    if (cfg.providerSlug === 'openai-compatible' || cfg.providerSlug === 'openai') {
        if (baseUrl.endsWith('/v1')) baseUrl = `${baseUrl}/chat/completions`;
    }

    return {
        getEndpoint: baseUrl || `https://api.openai.com/v1/chat/completions`,
        getHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    };
}
