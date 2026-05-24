import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * AI Chat API Route
 * 
 * Proxies chat requests to the configured AI provider.
 * Injects real-time dashboard data as context so AI can answer questions about the business.
 * 
 * READ ONLY - only reads data from Supabase, never writes.
 */

interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
}

async function getDashboardContext(): Promise<string> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');
    const now = new Date().toISOString();
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const monthAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

    try {
        // Current occupancy
        const { count: totalRooms } = await supabase
            .from('nomor_kamar')
            .select('id', { count: 'exact', head: true });

        const { data: activeStays } = await supabase
            .from('transactions')
            .select('room_number, apartment_location')
            .lte('checkin_at', now)
            .gte('checkout_at', now);

        const occupiedRooms = new Set(
            activeStays?.map((t: any) => `${t.apartment_location}-${t.room_number}`) || []
        ).size;

        // Today's stats
        const { count: todayBookings } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .gte('checkin_at', `${today}T00:00:00`)
            .lt('checkin_at', `${today}T23:59:59`);

        const { data: todayRevData } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', `${today}T00:00:00`)
            .lt('checkin_at', `${today}T23:59:59`);

        const todayRevenue = todayRevData?.reduce(
            (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0), 0
        ) || 0;

        // Week stats
        const { data: weekRevData } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', `${weekAgo}T00:00:00`);

        const weekRevenue = weekRevData?.reduce(
            (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0), 0
        ) || 0;

        // Month stats
        const { data: monthRevData, count: monthBookings } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount, apartment_location', { count: 'exact' })
            .gte('checkin_at', `${monthAgo}T00:00:00`);

        const monthRevenue = monthRevData?.reduce(
            (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0), 0
        ) || 0;

        // Location breakdown
        const locationCounts: Record<string, number> = {};
        monthRevData?.forEach((t: any) => {
            locationCounts[t.apartment_location] = (locationCounts[t.apartment_location] || 0) + 1;
        });

        // Locations info
        const { data: locations } = await supabase
            .from('lokasi_apartemen')
            .select('name');

        const locationNames = locations?.map((l: any) => l.name) || [];

        return `
DATA REAL-TIME KAKARAMA ROOM (${today}, waktu Jakarta):
- Total unit/kamar: ${totalRooms || 0}
- Kamar terisi saat ini: ${occupiedRooms}
- Kamar tersedia: ${(totalRooms || 0) - occupiedRooms}
- Okupansi: ${totalRooms ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : 0}%

HARI INI:
- Booking baru: ${todayBookings || 0}
- Pendapatan: Rp ${todayRevenue.toLocaleString('id-ID')}

7 HARI TERAKHIR:
- Total pendapatan: Rp ${weekRevenue.toLocaleString('id-ID')}
- Jumlah transaksi: ${weekRevData?.length || 0}

30 HARI TERAKHIR:
- Total pendapatan: Rp ${monthRevenue.toLocaleString('id-ID')}
- Jumlah transaksi: ${monthBookings || 0}
- Rata-rata per hari: Rp ${Math.round(monthRevenue / 30).toLocaleString('id-ID')}

LOKASI (${locationNames.length} lokasi):
${locationNames.map(name => `- ${name}: ${locationCounts[name] || 0} transaksi (30 hari)`).join('\n')}
`.trim();
    } catch (error) {
        console.error('Error getting dashboard context:', error);
        return 'Data tidak tersedia saat ini.';
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, config } = body as { messages: any[]; config: AIConfig };

        // Resolve API key: client config > env variable
        const resolvedConfig: AIConfig = {
            provider: config?.provider || process.env.AI_PROVIDER || 'openai',
            apiKey: config?.apiKey || process.env.AI_API_KEY || '',
            model: config?.model || process.env.AI_MODEL || 'gpt-4o-mini',
            baseUrl: config?.baseUrl || process.env.AI_BASE_URL || undefined,
        };

        if (!resolvedConfig.apiKey) {
            return NextResponse.json(
                { error: 'API key belum dikonfigurasi. Atur di halaman Analytics AI atau set AI_API_KEY di environment.' },
                { status: 400 }
            );
        }

        // Get dashboard context
        const dashboardContext = await getDashboardContext();

        // Build system message
        const systemMessage = {
            role: 'system',
            content: `Kamu adalah asisten AI analitik untuk Kakarama Room, sebuah bisnis penyewaan apartemen/kamar harian.
Tugasmu adalah membantu menganalisis data bisnis, memberikan insight, dan menjawab pertanyaan tentang performa bisnis.
Jawab dalam Bahasa Indonesia. Gunakan format teks biasa (JANGAN gunakan markdown seperti ** atau ##). Berikan analisis yang ringkas, actionable, dan berbasis data.

${dashboardContext}`
        };

        // Determine API endpoint based on provider
        let apiUrl: string;
        let headers: Record<string, string>;
        let requestBody: any;

        switch (resolvedConfig.provider) {
            case 'openai':
                apiUrl = resolvedConfig.baseUrl || 'https://api.openai.com/v1/chat/completions';
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedConfig.apiKey}`,
                };
                requestBody = {
                    model: resolvedConfig.model || 'gpt-4o-mini',
                    messages: [systemMessage, ...messages],
                    temperature: 0.7,
                    max_tokens: 2000,
                };
                break;

            case 'anthropic':
                apiUrl = resolvedConfig.baseUrl || 'https://api.anthropic.com/v1/messages';
                headers = {
                    'Content-Type': 'application/json',
                    'x-api-key': resolvedConfig.apiKey,
                    'anthropic-version': '2023-06-01',
                };
                requestBody = {
                    model: resolvedConfig.model || 'claude-sonnet-4-20250514',
                    max_tokens: 2000,
                    system: systemMessage.content,
                    messages: messages.map((m: any) => ({
                        role: m.role,
                        content: m.content,
                    })),
                };
                break;

            case 'deepseek':
                apiUrl = resolvedConfig.baseUrl || 'https://api.deepseek.com/v1/chat/completions';
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedConfig.apiKey}`,
                };
                requestBody = {
                    model: resolvedConfig.model || 'deepseek-chat',
                    messages: [systemMessage, ...messages],
                    temperature: 0.7,
                    max_tokens: 2000,
                };
                break;

            case 'openai-compatible':
                apiUrl = resolvedConfig.baseUrl || 'https://api.openai.com/v1/chat/completions';
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedConfig.apiKey}`,
                };
                requestBody = {
                    model: resolvedConfig.model || 'gpt-4o-mini',
                    messages: [systemMessage, ...messages],
                    temperature: 0.7,
                    max_tokens: 2000,
                };
                break;

            default:
                return NextResponse.json(
                    { error: 'Provider tidak didukung' },
                    { status: 400 }
                );
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('AI API error:', response.status, errorText);
            return NextResponse.json(
                { error: `AI API error: ${response.status} - ${errorText.substring(0, 200)}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        // Extract response based on provider
        let assistantMessage: string;

        if (resolvedConfig.provider === 'anthropic') {
            assistantMessage = data.content?.[0]?.text || 'Tidak ada respons.';
        } else {
            assistantMessage = data.choices?.[0]?.message?.content || 'Tidak ada respons.';
        }

        return NextResponse.json({ message: assistantMessage });
    } catch (error: any) {
        console.error('AI chat error:', error);
        return NextResponse.json(
            { error: `Gagal menghubungi AI: ${error.message}` },
            { status: 500 }
        );
    }
}
