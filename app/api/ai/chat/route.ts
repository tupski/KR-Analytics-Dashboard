import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { OPENAI_TOOLS, ANTHROPIC_TOOLS, executeTool, type ToolCall } from '@/lib/ai/tools';
import { parseAIResponse } from '@/lib/ai/responseParser';
import { getHeaderSafeTitle } from '@/lib/utils/headerSafe';
import { buildKraiSystemPrompt } from '@/lib/ai/krai-system-prompt';
import { normalizeAiText } from '@/lib/ai/normalizeAiText';

/**
 * KRAI CHAT ROUTE — Conversational AI with tool calling.
 *
 * Purpose: Business assistant chat with database tool access.
 * Characteristics:
 * - Tool calling loop — up to N iterations per user message
 * - Multi-provider support with auto-fallback
 * - Streaming capable
 * - Not cached — each conversation turn is unique
 * - Used by: AIChatCore, AIChatFloat, AIChatFullscreen components
 *
 * This is NOT the insight route. For cacheable summary generation,
 * see app/api/ai/insight/route.ts
 */

/**
 * AI Chat API Route — TOOL-CALLING enabled.
 *
 * Instead of stuffing all data into the system prompt, we expose tools that
 * let the AI query Supabase aggregates on demand. Loop until the AI returns
 * a plain text answer (no further tool calls).
 *
 * READ ONLY — tools are read-only aggregates.
 */

interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
    /** Label for logging/error messages */
    label?: string;
}

const MAX_TOOL_ITERATIONS = 8;

/** Priority ranking for auto-routing. Lower = tried first. */
const PROVIDER_PRIORITY: Record<string, number> = {
    deepseek: 1,
    gemini: 2,
    groq: 3,
    openai: 4,
    anthropic: 5,
    openrouter: 6,
    kiro: 7,
    'openai-compatible': 8,
};

/** Within a provider, model priority (lower = tried first) */
const MODEL_PRIORITY: Record<string, Record<string, number>> = {
    deepseek: {
        'deepseek-v4-flash': 1,
        'deepseek-v4-pro': 2,
        'deepseek-chat': 3,
        'deepseek-reasoner': 4,
    },
    // For other providers, use alphabetical + price
};

function getModelPriority(provider: string, model: string): number {
    return MODEL_PRIORITY[provider]?.[model] ?? 50;
}

/** Tiny snapshot to include in the system message so the AI knows what date "today" is. */
async function getQuickContext(): Promise<string> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const todayDate = toZonedTime(new Date(), timezone);
    const today = format(todayDate, 'yyyy-MM-dd');
    const yesterday = format(subDays(todayDate, 1), 'yyyy-MM-dd');
    const lastWeek = format(subDays(todayDate, 7), 'yyyy-MM-dd');
    const lastMonth = format(subDays(todayDate, 30), 'yyyy-MM-dd');
    const lastYear = format(subDays(todayDate, 365), 'yyyy-MM-dd');

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
- 1 tahun lalu (hari sama): ${lastYear}
- Total unit: ${totalRooms} kamar
- Lokasi: ${locationDescriptors}

PREFERENSI TOOLS (PENTING!):
- **Gunakan Panel Tools (get_dashboard_kpi_panel, get_marketing_panel, get_operations_panel, get_financial_panel) untuk pertanyaan umum** — tool panel mengembalikan MULTIPLE data sekaligus dan menggantikan 4-5 tool calls individual.
- Panel tools diprioritaskan untuk mengurangi jumlah tool calls:
  * get_dashboard_kpi_panel → untuk pertanyaan dashboard/KPI umum
  * get_marketing_panel → untuk pertanyaan marketing/sumber tamu/repeat
  * get_operations_panel → untuk pertanyaan operasional/okupansi/shift/karyawan
  * get_financial_panel → untuk pertanyaan keuangan/profit/YoY/trend
- Hanya gunakan tool individual (get_period_summary, get_repeat_guests, dll) jika hanya butuh 1-2 metrik spesifik.
- Untuk perbandingan periode, pakai compare_periods (langsung dapat delta otomatis).
- "Minggu lalu" = window (today-13) s/d (today-7). "Bulan lalu" = 30 hari sebelum window sekarang.
- Tanggal SELALU format YYYY-MM-DD.
- Jika tools error, sebutkan data tidak tersedia - jangan asumsikan.`;
}

// =========================================================
// OpenAI / DeepSeek / OpenAI-compatible loop
// =========================================================
async function runOpenAILoop(
    apiUrl: string,
    headers: Record<string, string>,
    model: string,
    systemContent: string,
    userMessages: any[],
): Promise<{ message: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    const conversation: any[] = [
        { role: 'system', content: systemContent },
        ...userMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const body = {
            model,
            messages: conversation,
            tools: OPENAI_TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 4096,
        };

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorText = await res.text();
            // Try to extract readable error from JSON error body
            let cleanError = errorText.substring(0, 300);
            try {
                const errJson = JSON.parse(errorText);
                if (errJson.error?.message) {
                    cleanError = errJson.error.message.substring(0, 300);
                } else if (errJson.message) {
                    cleanError = errJson.message.substring(0, 300);
                }
            } catch {
                // Not JSON — use truncated raw text
            }
            throw new Error(`AI API error: ${res.status} ${res.statusText} - ${cleanError}`);
        }

        // Parse response - supports both JSON and SSE formats
        // P0-3 FIX: parseAIResponse now handles all OpenAI-compatible formats safely
        const rawText = await res.text();
        let data: any;
        try {
            data = parseAIResponse(rawText);
        } catch (parseError: any) {
            throw new Error(`Gagal memproses respons AI: ${parseError.message}`);
        }

        // Handle double-encoded JSON: if data itself is a string, try parsing again
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch {
                // Not parseable — treat as content directly
                conversation.push({ role: 'assistant', content: data.substring(0, 8000) });
                return { message: data.substring(0, 8000), usage: totalUsage };
            }
        }

        // P0-3 FIX: Accept any combination of message fields — never fail on unknown fields
        const choice = data?.choices?.[0];
        const message = choice?.message;

        // Fallback: check for output_text or other content formats
        if (!message) {
            if (data?.output_text) {
                const normalized = normalizeAiText(data.output_text);
                conversation.push({ role: 'assistant', content: normalized });
                return { message: normalized, usage: totalUsage };
            }
            if (data?.content) {
                const normalized = normalizeAiText(data.content);
                conversation.push({ role: 'assistant', content: normalized });
                return { message: normalized, usage: totalUsage };
            }
            // Check for content array
            if (Array.isArray(data?.content)) {
                const textContent = data.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join('\n');
                if (textContent) {
                    const normalized = normalizeAiText(textContent);
                    conversation.push({ role: 'assistant', content: normalized });
                    return { message: normalized, usage: totalUsage };
                }
            }
            throw new Error('Respons AI kosong.');
        }

        // Accumulate token usage
        if (data.usage) {
            totalUsage.prompt_tokens += data.usage.prompt_tokens || 0;
            totalUsage.completion_tokens += data.usage.completion_tokens || 0;
            totalUsage.total_tokens += data.usage.total_tokens || 0;
        }

        const toolCalls = message.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
            const normalized = normalizeAiText(message.content || 'Tidak ada respons.');
            return { message: normalized, usage: totalUsage };
        }

        // Append assistant message + tool results, then loop
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
            const call: ToolCall = {
                name: tc.function?.name || '',
                arguments: parsedArgs,
            };
            const result = await executeTool(call);
            conversation.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: call.name,
                content: JSON.stringify(result).slice(0, 12000), // cap payload
            });
        }
    }

    return { message: 'Maaf, saya butuh terlalu banyak tool calls untuk menjawab. Coba persempit pertanyaan.', usage: totalUsage };
}

// =========================================================
// Anthropic loop
// =========================================================
async function runAnthropicLoop(
    apiUrl: string,
    headers: Record<string, string>,
    model: string,
    systemContent: string,
    userMessages: any[],
): Promise<{ message: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    let conversation: any[] = userMessages.map((m: any) => ({
        role: m.role,
        content: m.content,
    }));
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const body = {
            model,
            max_tokens: 4096,
            system: systemContent,
            tools: ANTHROPIC_TOOLS,
            messages: conversation,
        };

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`AI API error: ${res.status} - ${errorText.substring(0, 300)}`);
        }

        // Parse response as text first (Anthropic uses standard JSON, not SSE)
        const rawText = await res.text();
        let data: any;
        try {
            data = JSON.parse(rawText);
        } catch (error) {
            const preview = rawText.substring(0, 500);
            throw new Error(`Failed to parse Anthropic response. Preview: ${preview}`);
        }
        const blocks = data.content || [];
        const stopReason = data.stop_reason;

        // Accumulate token usage
        if (data.usage) {
            totalUsage.prompt_tokens += data.usage.input_tokens || 0;
            totalUsage.completion_tokens += data.usage.output_tokens || 0;
            totalUsage.total_tokens = totalUsage.prompt_tokens + totalUsage.completion_tokens;
        }

        const textBlocks = blocks.filter((b: any) => b.type === 'text');
        const toolUseBlocks = blocks.filter((b: any) => b.type === 'tool_use');

        if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
            const raw = textBlocks.map((b: any) => b.text).join('\n').trim() || 'Tidak ada respons.';
            return { message: normalizeAiText(raw), usage: totalUsage };
        }

        conversation.push({ role: 'assistant', content: blocks });

        const toolResults: any[] = [];
        for (const tu of toolUseBlocks) {
            const call: ToolCall = { name: tu.name, arguments: tu.input || {} };
            const result = await executeTool(call);
            toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: JSON.stringify(result).slice(0, 12000),
            });
        }
        conversation.push({ role: 'user', content: toolResults });
    }

    return { message: 'Maaf, saya butuh terlalu banyak tool calls untuk menjawab. Coba persempit pertanyaan.', usage: totalUsage };
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, config, thinkingMode } = body as {
            messages: any[];
            config: AIConfig;
            thinkingMode?: 'auto' | 'instant' | 'thinking';
        };

        // AUTO-FALLBACK ROUTING
        //
        // Client sends config.provider = provider ID or 'auto', and config.model = model ID or 'auto'.
        // When 'auto', we build a prioritized candidate list from ALL DB-configured providers,
        // sorted by provider priority then model priority. DeepSeek V4 Flash is always #1.
        //
        // If a candidate returns 429 (rate-limited) or 5xx (server error), we fall through
        // to the next candidate. Only auth errors (401/403) and client errors (4xx except 429)
        // are treated as fatal (won't retry).
        //
        // API keys are ALWAYS loaded from Supabase DB (decrypted) — client sends masked keys
        // with bullet chars that break HTTP headers.

        const isAuto = !config?.provider || config.provider === 'auto' || !config?.model || config.model === 'auto';

        let candidates: AIConfig[] = [];

        // ── Build candidate list from DB ──────────────────────────────────────
        try {
            const { loadAllProviderConfigs } = await import('@/lib/ai/configServer');
            const dbConfigs = await loadAllProviderConfigs();

            if (isAuto) {
                // Expand ALL configured providers → their models → candidate list
                const { PROVIDERS } = await import('@/lib/ai/models');
                const expanded: AIConfig[] = [];

                for (const db of dbConfigs) {
                    const providerInfo = PROVIDERS.find(p => p.id === db.providerId);
                    const models = providerInfo?.models || [];
                    const providerPriority = PROVIDER_PRIORITY[db.providerId] ?? 50;

                    // Sort models by priority (lower first), then by price
                    const sortedModels = [...models].sort((a, b) => {
                        const pa = getModelPriority(db.providerId, a.id);
                        const pb = getModelPriority(db.providerId, b.id);
                        if (pa !== pb) return pa - pb;
                        return a.inputPrice - b.inputPrice;
                    });

                    for (const m of sortedModels) {
                        // Filter by capability if thinkingMode requires reasoning
                        if (thinkingMode === 'thinking' && m.capabilities.reasoning === false) continue;
                        if (thinkingMode === 'instant' && m.capabilities.fast === false) continue;

                        expanded.push({
                            provider: db.providerId,
                            apiKey: db.apiKey,
                            model: m.id,
                            baseUrl: db.baseUrl,
                            label: `${providerInfo?.name || db.providerId} / ${m.label}`,
                        });
                    }
                }

                // Sort by provider priority, then model priority
                candidates = expanded.sort((a, b) => {
                    const ppA = PROVIDER_PRIORITY[a.provider] ?? 50;
                    const ppB = PROVIDER_PRIORITY[b.provider] ?? 50;
                    if (ppA !== ppB) return ppA - ppB;
                    return getModelPriority(a.provider, a.model) - getModelPriority(b.provider, b.model);
                });
            } else {
                // Explicit provider+model selected
                // FIX 9: Client-supplied apiKey (test connection) → use as primary, ignore DB
                if (config?.apiKey) {
                    candidates = [{
                        provider: config.provider,
                        apiKey: config.apiKey,
                        model: config.model || 'deepseek-v4-flash',
                        baseUrl: config.baseUrl || undefined,
                        label: `${config.provider} / ${config.model || 'specified'}`,
                    }];
                } else {
                    // No client key → use exact match from DB
                    const match = dbConfigs.find(c => c.providerId === config.provider);
                    if (match) {
                        candidates = [{
                            provider: match.providerId,
                            apiKey: match.apiKey,
                            model: config.model || match.model || 'deepseek-v4-flash',
                            baseUrl: config.baseUrl || match.baseUrl,
                            label: `${match.providerId} / ${config.model || match.model}`,
                        }];
                    }
                }
            }
        } catch (dbErr) {
            // DB unavailable — single candidate from client-supplied key or env
            candidates = [];
        }

        // ── Fallback: no DB config → client-supplied key or env ──────────────
        if (candidates.length === 0) {
            const fallbackApiKey = config?.apiKey || process.env.AI_API_KEY || '';
            const fallbackProvider = config?.provider || process.env.AI_PROVIDER || 'deepseek';
            const fallbackModel = config?.model || process.env.AI_MODEL || 'deepseek-chat';
            const fallbackBaseUrl = config?.baseUrl || process.env.AI_BASE_URL || undefined;

            if (!fallbackApiKey) {
                return NextResponse.json(
                    { error: 'API key belum dikonfigurasi. Atur di halaman Pengaturan atau buka KR·AI Chat.' },
                    { status: 400 },
                );
            }
            candidates = [{
                provider: fallbackProvider,
                apiKey: fallbackApiKey,
                model: fallbackModel,
                baseUrl: fallbackBaseUrl,
                label: `${fallbackProvider} / ${fallbackModel}`,
            }];
        }

        const quickContext = await getQuickContext();
        // Memory is client-side only — injected via request body
        const memoryContext: string = (body as any).memoryContext || '';

        // Thinking mode instruction
        let thinkingInstruction = '';
        if (thinkingMode === 'instant') {
            thinkingInstruction = `## Mode: INSTANT
Owner ingin jawaban cepat dan langsung. Berikan ringkas, fokus pada angka kunci dan 1-2 insight terpenting. Hindari analisis panjang. Maksimal 5 kalimat atau 1 paragraf + tabel kecil jika perlu.`;
        } else if (thinkingMode === 'thinking') {
            thinkingInstruction = `## Mode: DEEP THINKING
Owner ingin analisis mendalam. Ambil waktu untuk:
1. Pikirkan dahulu - pakai tools secara strategis untuk dapat data lengkap
2. Cari 3-5 angle analisis yang berbeda
3. Identifikasi pola tersembunyi dan korelasi antar metrik
4. Berikan struktur lengkap: Executive Summary -> Analisis -> Insight -> Risiko -> Rekomendasi
5. Sertakan visualisasi hint jika cocok`;
        }
        // 'auto' → no special instruction, default behavior

        const systemContent = buildKraiSystemPrompt(memoryContext, quickContext)
            + (thinkingInstruction ? '\n\n' + thinkingInstruction : '');

        // ── Retry loop over candidates with fallback on 429/5xx ─────────────
        let lastError: Error | null = null;

        for (const cand of candidates) {
            try {
                const result = await callProvider(cand, systemContent, messages);
                return NextResponse.json({
                    message: normalizeAiText(result.message),
                    model: cand.model,
                    provider: cand.provider,
                    usage: result.usage,
                });
            } catch (error: any) {
                lastError = error;
                const statusMatch = String(error.message || '').match(/AI API error: (\d+)/);
                const status = statusMatch ? parseInt(statusMatch[1]) : 0;

                // 429 (rate-limited) or 5xx (server error) → try next candidate
                if (status === 429 || (status >= 500 && status < 600)) {
                    const nextLabel = candidates.indexOf(cand) + 1 < candidates.length
                        ? candidates[candidates.indexOf(cand) + 1].label
                        : null;
                    if (nextLabel) {
                        console.warn(`[KR·AI] ${cand.label} failed with ${status}, falling back to ${nextLabel}`);
                    }
                    continue;
                }
                // 401/403 = auth error (fatal, don't retry with other keys for same endpoint)
                if (status === 401 || status === 403) {
                    throw new Error(`${cand.label}: Auth error — periksa API key di Pengaturan.`);
                }
                // Other errors (4xx, parsing errors, etc.) → also try next unless it's the last candidate
                if (candidates.indexOf(cand) + 1 < candidates.length) continue;
                throw error;
            }
        }

        // All candidates exhausted
        throw new Error(
            lastError
                ? `Gagal menghubungi AI: ${lastError.message}`
                : 'Tidak ada provider AI yang tersedia.',
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: `Gagal menghubungi AI: ${error.message}` },
            { status: 500 },
        );
    }
}

/** Execute a single provider+model call. Extracted for the retry loop. */
async function callProvider(
    cfg: AIConfig,
    systemContent: string,
    messages: any[],
): Promise<{ message: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    switch (cfg.provider) {
        case 'openai':
            return runOpenAILoop(
                cfg.baseUrl || 'https://api.openai.com/v1/chat/completions',
                { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
                cfg.model || 'gpt-4o-mini',
                systemContent,
                messages,
            );
        case 'deepseek':
            return runOpenAILoop(
                cfg.baseUrl || 'https://api.deepseek.com/v1/chat/completions',
                { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
                cfg.model || 'deepseek-chat',
                systemContent,
                messages,
            );
        case 'gemini':
            return runOpenAILoop(
                cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
                cfg.model || 'gemini-2.0-flash',
                systemContent,
                messages,
            );
        case 'groq':
            return runOpenAILoop(
                cfg.baseUrl || 'https://api.groq.com/openai/v1/chat/completions',
                { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
                cfg.model || 'llama-3.3-70b-versatile',
                systemContent,
                messages,
            );
        case 'openrouter': {
            let apiUrl = cfg.baseUrl || 'https://openrouter.ai/api/v1/chat/completions';
            if (apiUrl.endsWith('/v1')) apiUrl = `${apiUrl}/chat/completions`;
            return runOpenAILoop(
                apiUrl,
                {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${cfg.apiKey}`,
                    'HTTP-Referer': 'https://kakarama.com',
                    'X-Title': getHeaderSafeTitle('Analytics'),
                },
                cfg.model || 'meta-llama/llama-3.3-70b-instruct:free',
                systemContent,
                messages,
            );
        }
        case 'kiro': {
            if (!cfg.baseUrl) throw new Error('Base URL Kiro belum dikonfigurasi.');
            return runOpenAILoop(
                cfg.baseUrl,
                { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
                cfg.model || 'kiro-claude-sonnet-4',
                systemContent,
                messages,
            );
        }
        case 'anthropic':
            return runAnthropicLoop(
                cfg.baseUrl || 'https://api.anthropic.com/v1/messages',
                { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
                cfg.model || 'claude-haiku-4-20250514',
                systemContent,
                messages,
            );
        case 'openai-compatible': {
            let apiUrl = cfg.baseUrl || 'https://api.openai.com/v1/chat/completions';
            if (apiUrl.endsWith('/v1')) apiUrl = `${apiUrl}/chat/completions`;
            return runOpenAILoop(
                apiUrl,
                { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
                cfg.model || 'gpt-4o-mini',
                systemContent,
                messages,
            );
        }
        default:
            throw new Error(`Provider "${cfg.provider}" tidak didukung`);
    }
}
