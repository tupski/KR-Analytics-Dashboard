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
}

const MAX_TOOL_ITERATIONS = 4;

/**
 * POST /api/ai/insight
 *
 * Generates or retrieves cached AI insight.
 *
 * Flow:
 * 1. Compute cache_key from params
 * 2. Check ai_insight_cache for unexpired entry (skip if forceRefresh)
 * 3. If cached → return { cached: true, response, ... }
 * 4. If miss → load AI config, call provider, store in cache, return
 * 5. On AI error → return { error: true, fallback: true } so client uses rule-based
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
        } = body;

        if (!page || !prompt) {
            return NextResponse.json(
                { error: 'page and prompt are required' },
                { status: 400 },
            );
        }

        // ── 0. Load settings ──────────────────────────────────────
        const settings = await getInsightSettings();

        // If insight is disabled, client should use rule-based
        if (!settings.enabled) {
            return NextResponse.json({ disabled: true, fallback: true });
        }

        // ── 1. Resolve provider + model ───────────────────────────
        const aiConfig = await getAIConfigForInsight();
        if (!aiConfig) {
            return NextResponse.json({ error: true, fallback: true });
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
            // Build a quick system context snippet
            const quickContext = await getQuickContext();
            const compareSuffix = withCompare
                ? `\n\nPERMINTAAN TAMBAHAN: Lakukan analisis komparatif dengan periode sebelumnya yang relevan (kemarin, minggu lalu, bulan lalu, atau tahun lalu). Gunakan tools compare_periods untuk mendapat delta otomatis. Dalam jawaban: - Sertakan severity label (🚨/⚠️/✅/📈/🏆) berdasarkan besarnya perubahan - Jelaskan makna bisnis dari perubahan tersebut, bukan hanya angka - Identifikasi penyebab potensial dari tren yang terdeteksi - Beri 1-2 rekomendasi actionable spesifik berdasarkan temuan perbandingan ini`
                : '';

            const systemContent = `# KRAI - AI Business Copilot Kakarama Room

Kamu adalah KRAI, AI Business Copilot untuk Kakarama Room (bisnis penyewaan apartemen & kamar harian di Indonesia).

Kamu berperan sebagai Business Intelligence Analyst yang membantu owner memahami kondisi bisnis.

## Gaya Jawaban
- Bahasa Indonesia formal namun ramah
- Gunakan **bold** untuk angka penting
- Sertakan emoji severity label yang relevan
- Berikan analisis singkat dan actionable (2-4 paragraf)
- Jangan hanya menyebut angka — jelaskan makna bisnisnya
- Akhiri dengan 1-2 rekomendasi spesifik

${quickContext}`;

            const userMessage = prompt + compareSuffix;

            // We call the existing /api/ai/chat logic but as a direct function call
            // Instead of calling our own endpoint (which would be an HTTP loop),
            // we directly invoke provider calling logic similar to chat/route.ts
            const result = await callProviderForInsight(
                aiConfig,
                systemContent,
                userMessage,
            );

            const responseData = {
                message: result.message,
                model: aiConfig.modelId,
                provider: aiConfig.providerSlug,
                usage: result.usage,
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

            // If mode is 'ai-with-fallback', tell client to use rule-based
            if (settings.mode === 'ai-with-fallback') {
                return NextResponse.json({ error: true, fallback: true });
            }

            // If mode is 'ai-generated' only, return the error
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

// ── Provider calling logic (simplified, no tool loops for insight) ─────────

async function getQuickContext(): Promise<string> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const todayDate = toZonedTime(new Date(), timezone);
    const today = format(todayDate, 'yyyy-MM-dd');
    const yesterday = format(subDays(todayDate, 1), 'yyyy-MM-dd');
    const lastWeek = format(subDays(todayDate, 7), 'yyyy-MM-dd');
    const lastMonth = format(subDays(todayDate, 30), 'yyyy-MM-dd');

    let locationDescriptors = '';
    let totalRooms = 0;
    try {
        const { data: locations } = await supabase
            .from('lokasi_apartemen')
            .select('name, total_rooms');
        locationDescriptors = (locations || [])
            .map((l: any) => `${l.name} (${l.total_rooms || '?'} kamar)`)
            .join(', ');
        const { count } = await supabase
            .from('nomor_kamar')
            .select('id', { count: 'exact', head: true });
        totalRooms = count || 0;
    } catch { /* swallow */ }

    return `KONTEKS SISTEM:
- Hari ini: ${today} (Asia/Jakarta)
- Kemarin: ${yesterday}
- 7 hari lalu (hari sama): ${lastWeek}
- 30 hari lalu (hari sama): ${lastMonth}
- Total unit: ${totalRooms} kamar
- Lokasi: ${locationDescriptors}

ATURAN:
- Gunakan tools untuk semua data - jangan mengarang angka.
- Untuk perbandingan periode, pakai compare_periods.
- Tanggal SELALU format YYYY-MM-DD.
- Jika tools error, sebutkan data tidak tersedia.`;
}

/**
 * Simplified provider call for insight generation.
 * Uses OpenAI-compatible endpoint with tool access for data.
 */
async function callProviderForInsight(
    cfg: { providerSlug: string; apiKey: string; modelId: string; baseUrl?: string },
    systemContent: string,
    userPrompt: string,
): Promise<{ message: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    // Build endpoint URL based on provider
    const { getEndpoint, getHeaders } = resolveProviderEndpoint(cfg);

    const { OPENAI_TOOLS, executeTool } = await import('@/lib/ai/tools');
    const { parseAIResponse } = await import('@/lib/ai/responseParser');

    const conversation: any[] = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userPrompt },
    ];

    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const body = {
            model: cfg.modelId,
            messages: conversation,
            tools: OPENAI_TOOLS,
            tool_choice: 'auto' as const,
            temperature: 0.7,
            max_tokens: 2048,
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
            // Try alternate response shapes
            if (data?.output_text) {
                return { message: data.output_text, usage: totalUsage };
            }
            if (data?.content) {
                return { message: typeof data.content === 'string' ? data.content : JSON.stringify(data.content), usage: totalUsage };
            }
            throw new Error('Respons AI kosong.');
        }

        if (data.usage) {
            totalUsage.prompt_tokens += data.usage.prompt_tokens || 0;
            totalUsage.completion_tokens += data.usage.completion_tokens || 0;
            totalUsage.total_tokens += data.usage.total_tokens || 0;
        }

        const toolCalls = message.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
            return { message: message.content || 'Tidak ada respons.', usage: totalUsage };
        }

        // Execute tool calls
        conversation.push({
            role: 'assistant',
            content: message.content || '',
            tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
            let parsedArgs: Record<string, any> = {};
            try {
                parsedArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
                parsedArgs = {};
            }
            const result = await executeTool({
                name: tc.function?.name || '',
                arguments: parsedArgs,
            });
            conversation.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: tc.function?.name || '',
                content: JSON.stringify(result).slice(0, 12000),
            });
        }
    }

    return {
        message: 'Maaf, proses analisis terlalu kompleks. Coba persempit pertanyaan.',
        usage: totalUsage,
    };
}

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

    // OpenAI-compatible: default to chat completions path
    if (cfg.providerSlug === 'openai-compatible' || cfg.providerSlug === 'openai') {
        if (baseUrl.endsWith('/v1')) baseUrl = `${baseUrl}/chat/completions`;
    }

    return {
        getEndpoint: baseUrl || `https://api.openai.com/v1/chat/completions`,
        getHeaders: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    };
}
