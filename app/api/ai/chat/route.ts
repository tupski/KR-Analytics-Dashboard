import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { OPENAI_TOOLS, ANTHROPIC_TOOLS, executeTool, type ToolCall } from '@/lib/ai/tools';

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
}

const MAX_TOOL_ITERATIONS = 5;

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

ATURAN:
- Gunakan TOOLS yang tersedia untuk mengambil data yang kamu butuhkan dari Supabase.
- Untuk pertanyaan komparatif (vs minggu/bulan/tahun lalu), pakai compare_periods sehingga kamu mendapat delta otomatis.
- Untuk minggu lalu, pakai rentang (today-13) s/d (today-7) sebagai window pembanding 7 hari.
- Tanggal SELALU format YYYY-MM-DD.
- Jawab dalam Bahasa Indonesia, ringkas, format teks biasa (TIDAK pakai markdown ** atau ##).
- Jangan mengarang angka — kalau tools tidak bisa kasih data, sebutkan terus terang.`;
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
): Promise<string> {
    const conversation: any[] = [
        { role: 'system', content: systemContent },
        ...userMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const body = {
            model,
            messages: conversation,
            tools: OPENAI_TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 2000,
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

        const data = await res.json();
        const choice = data.choices?.[0];
        const message = choice?.message;
        if (!message) throw new Error('Respons AI kosong.');

        const toolCalls = message.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
            return message.content || 'Tidak ada respons.';
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

    return 'Maaf, saya butuh terlalu banyak tool calls untuk menjawab. Coba persempit pertanyaan.';
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
): Promise<string> {
    let conversation: any[] = userMessages.map((m: any) => ({
        role: m.role,
        content: m.content,
    }));

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const body = {
            model,
            max_tokens: 2000,
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

        const data = await res.json();
        const blocks = data.content || [];
        const stopReason = data.stop_reason;

        const textBlocks = blocks.filter((b: any) => b.type === 'text');
        const toolUseBlocks = blocks.filter((b: any) => b.type === 'tool_use');

        if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
            return textBlocks.map((b: any) => b.text).join('\n').trim() || 'Tidak ada respons.';
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

    return 'Maaf, saya butuh terlalu banyak tool calls untuk menjawab. Coba persempit pertanyaan.';
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, config } = body as { messages: any[]; config: AIConfig };

        const resolvedConfig: AIConfig = {
            provider: config?.provider || process.env.AI_PROVIDER || 'deepseek',
            apiKey: config?.apiKey || process.env.AI_API_KEY || '',
            model: config?.model || process.env.AI_MODEL || 'deepseek-chat',
            baseUrl: config?.baseUrl || process.env.AI_BASE_URL || undefined,
        };

        if (!resolvedConfig.apiKey) {
            return NextResponse.json(
                { error: 'API key belum dikonfigurasi. Atur di halaman Analytics AI atau set AI_API_KEY di environment.' },
                { status: 400 },
            );
        }

        const quickContext = await getQuickContext();
        const systemContent = `Kamu adalah asisten AI analitik untuk Kakarama Room (bisnis penyewaan apartemen/kamar harian di Indonesia). Kamu PUNYA AKSES ke database via tools. Selalu pakai tools untuk dapat angka aktual sebelum menjawab.

${quickContext}`;

        let assistantMessage: string;

        switch (resolvedConfig.provider) {
            case 'openai': {
                const apiUrl = resolvedConfig.baseUrl || 'https://api.openai.com/v1/chat/completions';
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${resolvedConfig.apiKey}`,
                };
                assistantMessage = await runOpenAILoop(
                    apiUrl,
                    headers,
                    resolvedConfig.model || 'gpt-4o-mini',
                    systemContent,
                    messages,
                );
                break;
            }
            case 'deepseek': {
                const apiUrl = resolvedConfig.baseUrl || 'https://api.deepseek.com/v1/chat/completions';
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${resolvedConfig.apiKey}`,
                };
                assistantMessage = await runOpenAILoop(
                    apiUrl,
                    headers,
                    resolvedConfig.model || 'deepseek-chat',
                    systemContent,
                    messages,
                );
                break;
            }
            case 'openai-compatible': {
                const apiUrl = resolvedConfig.baseUrl || 'https://api.openai.com/v1/chat/completions';
                const headers = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${resolvedConfig.apiKey}`,
                };
                assistantMessage = await runOpenAILoop(
                    apiUrl,
                    headers,
                    resolvedConfig.model || 'gpt-4o-mini',
                    systemContent,
                    messages,
                );
                break;
            }
            case 'anthropic': {
                const apiUrl = resolvedConfig.baseUrl || 'https://api.anthropic.com/v1/messages';
                const headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': resolvedConfig.apiKey,
                    'anthropic-version': '2023-06-01',
                };
                assistantMessage = await runAnthropicLoop(
                    apiUrl,
                    headers,
                    resolvedConfig.model || 'claude-haiku-4-20250514',
                    systemContent,
                    messages,
                );
                break;
            }
            default:
                return NextResponse.json({ error: 'Provider tidak didukung' }, { status: 400 });
        }

        return NextResponse.json({ message: assistantMessage });
    } catch (error: any) {
        console.error('AI chat error:', error);
        return NextResponse.json(
            { error: `Gagal menghubungi AI: ${error.message}` },
            { status: 500 },
        );
    }
}
