/**
 * AI tools — give the AI live, on-demand access to Supabase aggregates.
 *
 * Each tool is described in OpenAI function-calling format. We also export
 * an Anthropic-compatible variant. The executor maps name + arguments to a
 * Supabase query and returns a small JSON result.
 *
 * READ ONLY — these tools must never write to the database.
 */

import { createServerClient } from '@/lib/supabase/server';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 730; // 2 years

function validateDateRange(start: string, end: string) {
    if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end)) {
        throw new Error('Tanggal harus format YYYY-MM-DD.');
    }
    const s = new Date(start + 'T00:00:00Z').getTime();
    const e = new Date(end + 'T23:59:59Z').getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) throw new Error('Tanggal tidak valid.');
    if (e < s) throw new Error('end_date harus >= start_date.');
    if ((e - s) / 86400000 > MAX_RANGE_DAYS) {
        throw new Error(`Rentang maksimum ${MAX_RANGE_DAYS} hari.`);
    }
    return { startIso: `${start}T00:00:00`, endIso: `${end}T23:59:59` };
}

async function fetchPeriodSummary(
    start: string,
    end: string,
    location?: string,
): Promise<any> {
    const { startIso, endIso } = validateDateRange(start, end);
    const supabase = createServerClient();

    let txQuery = supabase
        .from('transactions')
        .select('cash_amount, transfer_amount, customer_name, room_number, apartment_location, marketing_name, marketing_fee', { count: 'exact' })
        .gte('checkin_at', startIso)
        .lte('checkin_at', endIso);

    let expQuery = supabase
        .from('pengeluaran')
        .select('jumlah, category', { count: 'exact' })
        .gte('tanggal', start)
        .lte('tanggal', end);

    if (location) {
        txQuery = txQuery.eq('apartment_location', location);
        expQuery = expQuery.eq('apartment_location', location);
    }

    const [{ data: txData, count: txCount }, { data: expData }] = await Promise.all([
        txQuery,
        expQuery,
    ]);

    const revenue = (txData || []).reduce(
        (s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0),
        0,
    );
    const cash = (txData || []).reduce((s: number, t: any) => s + (t.cash_amount || 0), 0);
    const transfer = (txData || []).reduce((s: number, t: any) => s + (t.transfer_amount || 0), 0);
    const marketingFeeTotal = (txData || []).reduce((s: number, t: any) => s + (t.marketing_fee || 0), 0);

    const distinctCustomers = new Set(
        (txData || [])
            .filter((t: any) => t.customer_name)
            .map((t: any) => String(t.customer_name).toLowerCase().trim()),
    ).size;

    const locationBreakdown: Record<string, { count: number; revenue: number }> = {};
    (txData || []).forEach((t: any) => {
        const loc = t.apartment_location || '(tanpa lokasi)';
        if (!locationBreakdown[loc]) locationBreakdown[loc] = { count: 0, revenue: 0 };
        locationBreakdown[loc].count++;
        locationBreakdown[loc].revenue += (t.cash_amount || 0) + (t.transfer_amount || 0);
    });

    const expenseTotal = (expData || []).reduce((s: number, e: any) => s + (e.jumlah || 0), 0);
    const expenseByCategory: Record<string, number> = {};
    (expData || []).forEach((e: any) => {
        const cat = e.category || 'Lainnya';
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + (e.jumlah || 0);
    });

    return {
        period: { start_date: start, end_date: end, location: location || null },
        transactions: txCount || 0,
        revenue,
        revenue_cash: cash,
        revenue_transfer: transfer,
        marketing_fee_total: marketingFeeTotal,
        expense_total: expenseTotal,
        net: revenue - expenseTotal,
        distinct_customers: distinctCustomers,
        location_breakdown: Object.entries(locationBreakdown)
            .sort((a, b) => b[1].revenue - a[1].revenue)
            .slice(0, 20)
            .map(([loc, d]) => ({ location: loc, count: d.count, revenue: d.revenue })),
        expense_by_category: Object.entries(expenseByCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, total]) => ({ category: cat, total })),
    };
}

async function fetchTopLocations(start: string, end: string, limit: number) {
    const r = await fetchPeriodSummary(start, end);
    return {
        period: r.period,
        top_locations: r.location_breakdown.slice(0, Math.min(limit, 50)),
    };
}

async function fetchTopCustomers(start: string, end: string, limit: number) {
    const { startIso, endIso } = validateDateRange(start, end);
    const supabase = createServerClient();

    const { data } = await supabase
        .from('transactions')
        .select('customer_name, cash_amount, transfer_amount')
        .gte('checkin_at', startIso)
        .lte('checkin_at', endIso);

    const map: Record<string, { visits: number; revenue: number; raw: string }> = {};
    (data || []).forEach((t: any) => {
        if (!t.customer_name) return;
        const key = String(t.customer_name).toLowerCase().trim();
        if (!map[key]) map[key] = { visits: 0, revenue: 0, raw: t.customer_name };
        map[key].visits++;
        map[key].revenue += (t.cash_amount || 0) + (t.transfer_amount || 0);
    });

    const top = Object.values(map)
        .sort((a, b) => b.visits - a.visits || b.revenue - a.revenue)
        .slice(0, Math.min(limit, 50))
        .map(c => ({ customer: c.raw, visits: c.visits, revenue: c.revenue }));

    return { period: { start_date: start, end_date: end }, top_customers: top };
}

async function fetchOutstandingBills(location?: string) {
    const supabase = createServerClient();

    try {
        const { data, error } = await supabase
            .rpc('get_outstanding_bills_summary', { p_location: location || null });

        if (error) throw error;
        return { source: 'get_outstanding_bills_summary', data };
    } catch (err: any) {
        // Fallback: count rows directly
        let q = supabase
            .from('tagihan_bulanan')
            .select('amount, due_date, status', { count: 'exact' })
            .eq('status', 'unpaid');
        if (location) q = q.eq('apartment_location', location);
        const { data, count } = await q;
        const total = (data || []).reduce((s: number, b: any) => s + (b.amount || 0), 0);
        return {
            source: 'fallback',
            unpaid_count: count || 0,
            unpaid_total: total,
            note: 'RPC get_outstanding_bills_summary tidak bisa diakses, hanya total dasar.',
        };
    }
}

async function fetchUnitInventory(location?: string) {
    const supabase = createServerClient();
    let q = supabase.from('nomor_kamar').select('lokasi', { count: 'exact', head: true });
    if (location) q = q.eq('lokasi', location);
    const { count: totalRooms } = await q;

    const now = new Date().toISOString();
    let txQ = supabase
        .from('transactions')
        .select('room_number, apartment_location')
        .lte('checkin_at', now)
        .gte('checkout_at', now);
    if (location) txQ = txQ.eq('apartment_location', location);
    const { data: active } = await txQ;
    const occupied = new Set(
        (active || []).map((t: any) => `${t.apartment_location}-${t.room_number}`),
    ).size;

    return {
        location: location || null,
        total_rooms: totalRooms || 0,
        occupied_now: occupied,
        available_now: Math.max(0, (totalRooms || 0) - occupied),
        occupancy_pct: totalRooms ? Math.round((occupied / totalRooms) * 10000) / 100 : 0,
    };
}

// =====================================================
// Public exports
// =====================================================

export interface ToolCall {
    name: string;
    arguments: Record<string, any>;
}

/** OpenAI / DeepSeek / openai-compatible function-calling schema. */
export const OPENAI_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_period_summary',
            description:
                'Ambil ringkasan bisnis (revenue, expense, transaksi, breakdown lokasi & kategori pengeluaran) untuk rentang tanggal apapun. Pakai untuk menjawab pertanyaan periode spesifik (minggu lalu, bulan tertentu, dll). Tanggal pakai timezone Asia/Jakarta.',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD (inclusive)' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD (inclusive)' },
                    location: { type: 'string', description: 'Filter apartment_location (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'compare_periods',
            description:
                'Bandingkan dua periode side-by-side. Otomatis hitung delta dan persentase perubahan. Berguna untuk pertanyaan "vs minggu/bulan/tahun lalu".',
            parameters: {
                type: 'object',
                properties: {
                    a_start: { type: 'string', description: 'Periode A start YYYY-MM-DD' },
                    a_end: { type: 'string', description: 'Periode A end YYYY-MM-DD' },
                    b_start: { type: 'string', description: 'Periode B start YYYY-MM-DD' },
                    b_end: { type: 'string', description: 'Periode B end YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['a_start', 'a_end', 'b_start', 'b_end'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_top_locations',
            description: 'Daftar lokasi apartemen dengan revenue/transaksi tertinggi pada periode tertentu.',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string' },
                    end_date: { type: 'string' },
                    limit: { type: 'number', description: 'Default 10, maksimum 50' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_top_customers',
            description: 'Top customer berdasarkan jumlah kunjungan/pendapatan dalam periode tertentu (untuk identifikasi tamu repeat).',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string' },
                    end_date: { type: 'string' },
                    limit: { type: 'number', description: 'Default 10, maksimum 50' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_outstanding_bills',
            description: 'Ringkasan tagihan bulanan yang belum dibayar (aging by bucket: 0-30, 31-60, 61-90, >90 hari).',
            parameters: {
                type: 'object',
                properties: {
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_unit_inventory',
            description: 'Status inventory unit saat ini: total kamar, terisi sekarang, tersedia, persentase okupansi. Bisa difilter per lokasi.',
            parameters: {
                type: 'object',
                properties: {
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
            },
        },
    },
];

/** Anthropic Messages tool schema (compatible). */
export const ANTHROPIC_TOOLS = OPENAI_TOOLS.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
}));

/** Execute a single tool call. Returns the result object that should be JSON-stringified back to the LLM. */
export async function executeTool(call: ToolCall): Promise<any> {
    try {
        switch (call.name) {
            case 'get_period_summary':
                return await fetchPeriodSummary(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'compare_periods': {
                const [a, b] = await Promise.all([
                    fetchPeriodSummary(call.arguments.a_start, call.arguments.a_end, call.arguments.location),
                    fetchPeriodSummary(call.arguments.b_start, call.arguments.b_end, call.arguments.location),
                ]);
                const pct = (cur: number, prev: number) => {
                    if (prev === 0) return cur === 0 ? 0 : null;
                    return Math.round(((cur - prev) / prev) * 10000) / 100;
                };
                return {
                    period_a: a,
                    period_b: b,
                    deltas: {
                        revenue_change_pct: pct(a.revenue, b.revenue),
                        expense_change_pct: pct(a.expense_total, b.expense_total),
                        transaction_change_pct: pct(a.transactions, b.transactions),
                        net_change_pct: pct(a.net, b.net),
                        revenue_diff: a.revenue - b.revenue,
                        expense_diff: a.expense_total - b.expense_total,
                        transaction_diff: a.transactions - b.transactions,
                    },
                };
            }

            case 'get_top_locations':
                return await fetchTopLocations(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.limit || 10,
                );

            case 'get_top_customers':
                return await fetchTopCustomers(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.limit || 10,
                );

            case 'get_outstanding_bills':
                return await fetchOutstandingBills(call.arguments.location);

            case 'get_unit_inventory':
                return await fetchUnitInventory(call.arguments.location);

            default:
                return { error: `Unknown tool: ${call.name}` };
        }
    } catch (err: any) {
        return { error: err?.message || 'Tool execution failed' };
    }
}
