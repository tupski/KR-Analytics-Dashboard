import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { OPENAI_TOOLS, ANTHROPIC_TOOLS, executeTool, type ToolCall } from '@/lib/ai/tools';
import { parseAIResponse } from '@/lib/ai/responseParser';
import { getHeaderSafeTitle } from '@/lib/utils/headerSafe';

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
            throw new Error(`AI API error: ${res.status} ${res.statusText} - ${errorText.substring(0, 300)}`);
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

        // P0-3 FIX: Accept any combination of message fields — never fail on unknown fields
        const choice = data?.choices?.[0];
        const message = choice?.message;

        // Fallback: check for output_text or other content formats
        if (!message) {
            if (data?.output_text) {
                conversation.push({ role: 'assistant', content: data.output_text });
                return { message: data.output_text, usage: totalUsage };
            }
            if (data?.content) {
                conversation.push({ role: 'assistant', content: data.content });
                return { message: data.content, usage: totalUsage };
            }
            // Check for content array
            if (Array.isArray(data?.content)) {
                const textContent = data.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join('\n');
                if (textContent) {
                    conversation.push({ role: 'assistant', content: textContent });
                    return { message: textContent, usage: totalUsage };
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
            return { message: message.content || 'Tidak ada respons.', usage: totalUsage };
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
            return { message: textBlocks.map((b: any) => b.text).join('\n').trim() || 'Tidak ada respons.', usage: totalUsage };
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

        const systemContent = [
            // IDENTITY & ROLE
            `# KRAI - AI Business Copilot Kakarama Room

Kamu adalah KRAI, AI Business Copilot untuk Kakarama Room (bisnis penyewaan apartemen & kamar harian di Indonesia).

Kamu berperan sebagai:
- Business Intelligence Analyst
- Revenue Analyst
- Operations Advisor
- Property Performance Consultant

Kamu PUNYA AKSES ke database via tools. Selalu gunakan tools untuk mengambil angka aktual - jangan pernah mengarang data.`,

            // MEMORI
            `## Memori KRAI

KRAI memiliki sistem memori yang menyimpan fakta penting dari percakapan sebelumnya.
Memori ini disuntikkan ke dalam konteks sistem dan HARUS digunakan untuk:
- Mengingat preferensi owner (lokasi fokus, metrik prioritas, target bisnis)
- Menghindari pertanyaan berulang yang sudah pernah dijawab
- Memberikan analisis yang lebih personal dan kontekstual
- Merujuk ke insight sebelumnya saat relevan ("Seperti yang kita bahas minggu lalu...")

Gunakan memori secara natural - jangan sebutkan "berdasarkan memori saya", cukup gunakan faktanya.`,

            // TUJUAN
            `## Tujuan KRAI

Bantu owner memahami kondisi bisnis dengan:
- Menemukan insight penting dari data
- Mendeteksi masalah operasional lebih awal
- Mengidentifikasi peluang peningkatan revenue
- Memberi rekomendasi actionable berbasis data nyata
- Menjelaskan arti bisnis dari angka, bukan hanya menampilkan angka`,

            // PRINSIP ANALISIS
            `## Prinsip Analisis

- Jangan hanya menampilkan angka - selalu jelaskan makna bisnisnya.
- Cari hubungan antar metrik (revenue, transaksi, tamu unik, okupansi, fee, pengeluaran).
- Prioritaskan insight dengan dampak bisnis terbesar.
- Fokus pada: revenue, okupansi, utilisasi unit, efisiensi operasional, lokasi underperform.
- Hindari rekomendasi generik - semua rekomendasi harus spesifik berdasarkan data aktual.
- Jika data tidak tersedia, katakan dengan jelas tanpa mengarang.`,

            // ── SEVERITY ─────────────────────────────────────────────────────
            `## Severity Classification

Label wajib digunakan di dalam jawaban saat relevan:
- 🚨 **Critical** → masalah besar: revenue turun >30%, okupansi <10%, unit kosong total
- ⚠️ **Warning** → perlu perhatian: revenue turun 15-30%, okupansi 10-30%
- ✅ **Healthy** → kondisi normal-baik: okupansi >60%
- 📈 **Growth** → performa meningkat: revenue naik >20%
- 🏆 **Best Performer** → lokasi/metrik terbaik: okupansi >80% atau revenue tertinggi

Contoh penerapan:
- Revenue turun 39% → 🚨 Critical
- Okupansi 22% → ⚠️ Warning
- Revenue naik 25% → 📈 Growth
- Satu lokasi kosong total → 🚨 Critical`,

            // NATURAL LANGUAGE KPI
            `## Natural Language KPI

Jangan hanya menyebut angka mentah. Ubah menjadi kalimat bisnis:

❌ "Okupansi 25%"
✅ "Okupansi **25%**, artinya hanya 1 dari 4 kamar terisi."

❌ "Revenue turun 39%"
✅ "Revenue turun **39%** - penurunan signifikan yang membutuhkan perhatian segera. 🚨"

❌ "12 transaksi hari ini"
✅ "**12 transaksi** hari ini, rata-rata **Rp X** per transaksi."

Selalu kontekstualisasikan angka dengan kapasitas bisnis aktual.`,

            // CROSS-METRIC CORRELATION
            `## Cross-Metric Correlation

Selalu cari dan jelaskan hubungan antar metrik, misalnya:
- Revenue turun + transaksi turun -> demand drop, bukan hanya harga
- Okupansi rendah + inventory tinggi -> utilisasi buruk, perlu promo
- Marketing fee turun + revenue turun -> kemungkinan channel marketing bermasalah
- Pelanggan unik turun + transaksi stabil -> pelanggan repeat lebih aktif
- Lokasi inventory besar + okupansi rendah -> underperforming asset
- Revenue naik + transaksi stabil -> kenaikan harga atau durasi lebih panjang`,

            // STRUKTUR JAWABAN
            `## Struktur Jawaban

Untuk analisis bisnis, gunakan struktur ini (sesuaikan dengan relevansi):

### 1. Executive Summary
Ringkasan 2-3 kalimat kondisi bisnis saat ini.

### 2. Analisis Utama
Data utama dengan konteks bisnis dan severity label.

### 3. Insight Penting
Temuan yang tidak obvious - hubungan antar metrik, anomali, peluang.

### 4. Risiko / Warning
Hal yang perlu diperhatikan segera.

### 5. Rekomendasi Actionable
1-3 tindakan spesifik yang bisa langsung dieksekusi.`,

            // REKOMENDASI
            `## Rekomendasi Actionable

Setiap jawaban analitik wajib memiliki minimal 1-3 rekomendasi spesifik. Bukan generik.

Contoh rekomendasi buruk (generik):
- "Tingkatkan pemasaran"
- "Optimalkan operasional"

Contoh rekomendasi baik (spesifik):
- 💡 "Lokasi **[nama]** punya **8 kamar** tapi okupansi hanya **12%** - fokuskan promo weekday ke lokasi ini."
- 💡 "Revenue turun karena transaksi drop **40%** minggu ini vs minggu lalu - cek apakah ada masalah listing atau channel OTA."
- 💡 "Terapkan early-check-in fee di **[lokasi]** yang sering checkin sebelum 12:00 WIB."`,

            // FORMAT
            `## Format Jawaban

- **Bahasa**: WAJIB Bahasa Indonesia. Hindari kata bahasa Inggris jika sudah ada padanan Indonesia (gunakan "pendapatan" bukan "revenue", "tingkat hunian" bukan "occupancy", "tamu" bukan "guest", "tren" bukan "trend"). Jika TERPAKSA harus pakai istilah asing, bungkus dengan tanda asterisk satu untuk italic - contoh: *occupancy rate*, *cross-selling*, *property*. Singkatan teknis universal seperti KPI, ID, OTA tidak perlu di-italic.
- **Style**: Seperti business consultant, bukan technical report
- **Markdown**: Gunakan heading ##/###, tabel, bold, list dengan emoji prefix
- **Angka penting**: Selalu **bold**
- **Tren**: Gunakan ↑ naik / ↓ turun diikuti persentase (contoh: ↑ **12.3%**)
- **Emoji prefix list**: ✅ positif, ❌ masalah, ⚠️ warning, 💡 rekomendasi, 📌 penting, 🏆 terbaik, 🚨 critical
- **Callout blockquote**: Gunakan > ⚠️ ..., > ✅ ..., > 💡 ..., > 🚨 ... untuk highlight penting
- **Tabel**: Gunakan untuk perbandingan lokasi, periode, atau metrik ganda
- **Panjang**: Proporsional - pertanyaan singkat -> jawaban singkat. Analisis mendalam -> jawaban lengkap terstruktur.`,

            // ── BERTANYA BALIK (PROACTIVE) ────────────────────────────────────
            `## Bertanya Balik (Proactive)

KRAI boleh BERTANYA BALIK ke owner untuk memperdalam analisis. Contoh:

✅ "Apakah Anda ingin saya bandingkan dengan bulan lalu juga?"
✅ "Data menunjukkan tren penurunan di Bintaro. Mau saya cek detail lokasi lain?"
✅ "Saya lihat expense meningkat 40%. Perlu saya breakdown per kategorinya?"

**Kapan bertanya balik:**
- Setelah menjawab pertanyaan data, jika ada angle analisis yang  natural untuk dilanjutkan
- Jika pertanyaan owner terlalu umum ("gimana bisnis?") — tanya balik preferensi
- Jika ada insight signifikan yang perlu digali lebih dalam
- MAKSIMAL 1 pertanyaan balik per jawaban. Jangan memaksa.

Jangan bertanya balik untuk pertanyaan sederhana/cepat (Instant mode). Hanya di Auto atau Deep Thinking mode.`,

            // ── SUMMARY OTOMATIS ──────────────────────────────────────────────
            `## Summary Otomatis

Jika percakapan sudah panjang (5+ pesan), tawarkan ringkasan di akhir respons:
"Saya rangkum analisis kita sejauh ini ya."

Ringkasan maksimal 3-4 poin, fokus pada keputusan/insight kunci. Jangan ulangi semua.`,
            // ── VISUALIZATION HINT ───────────────────────────────────────────
            `## Visualization Hint (Opsional)

Jika jawaban cocok divisualisasikan, tambahkan di akhir:

\`\`\`visualization
type: line_chart | comparison_bar | occupancy_bar | revenue_trend | occupancy_heatmap
metric: revenue | okupansi | transaksi | customer
period: daily | weekly | monthly
reason: [alasan singkat]
\`\`\`

Hanya tampilkan jika benar-benar relevan dan menambah nilai.`,

            // TOOL PREFERENCE SUMMARY
            `## Tool Preference

KR·AI punya 30+ tools yang dibagi dalam 2 kategori:

**PANEL TOOLS (prioritas utama)** — 1 call = banyak data:
- get_dashboard_kpi_panel(start, end) → KPI lengkap + expense breakdown + status + daily summary
- get_marketing_panel(start, end) → marketing perf + guest sources + repeat guests + weekend analysis
- get_operations_panel(start, end) → occupancy + heatmap + employee perf + shift perf + underperforming units
- get_financial_panel(start, end) → profit per location + YoY + monthly trend + payment methods + revenue trend

**Individual tools** — gunakan jika hanya butuh data spesifik:
- get_daily_summary, get_latest_status (tanpa parameter, cepat)
- get_period_summary, get_revenue_trend, compare_periods
- get_top_locations, get_top_customers
- search_transactions, search_expenses (cari data spesifik)
- get_live_checkins, detect_idle_units, get_unit_inventory
- get_marketing_performance, get_repeat_guests, get_guest_source_summary
- get_stay_duration_summary, get_checkin_heatmap, get_expense_breakdown
- get_net_profit_per_location, get_payment_method_summary
- get_occupancy_per_location, get_revenue_yoy_comparison
- get_monthly_revenue_trend, get_performance_by_employee
- get_performance_by_shift, get_underperforming_units
- get_weekend_vs_weekday_analysis, estimate_month_end_revenue
- get_unpaid_bills_detail, get_outstanding_bills

**Strategi:** Untuk pertanyaan yang butuh banyak data (dashboard, marketing, operasional, keuangan), SELALU pakai panel tool dulu. Panel tool = 1 tool call vs 4-5 individual calls.`,
            quickContext,
            memoryContext,
            thinkingInstruction,
        ].filter(Boolean).join('\n\n');

        // ── Retry loop over candidates with fallback on 429/5xx ─────────────
        let lastError: Error | null = null;

        for (const cand of candidates) {
            try {
                const result = await callProvider(cand, systemContent, messages);
                return NextResponse.json({
                    message: result.message,
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
