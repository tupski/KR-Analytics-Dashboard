/**
 * AI tools — give the AI live, on-demand access to Supabase aggregates.
 *
 * Each tool is described in OpenAI function-calling format. We also export
 * an Anthropic-compatible variant. The executor maps name + arguments to a
 * Supabase query and returns a small JSON result.
 *
 * READ ONLY — these tools must never write to the database.
 *
 * Phase 0.1 — Mode-aware boundaries:
 *   Type A (user-explicit dates): calendar-day aligned, timezone-fixed
 *   Type B (today/yesterday/report context): uses getReportPeriodRange()
 *     via getReportPeriodSetting() from DB.
 */

import { createServerClient } from '@/lib/supabase/server';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import { getTodayReportRange } from '@/lib/get-report-period-setting';
import { getReportPeriodRange } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 730; // 2 years

/**
 * Type A — user-explicit date range: calendar-day aligned.
 * Validates input format and returns ISO strings with WIB offset.
 */
function validateDateRange(start: string, end: string) {
    if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end)) {
        throw new Error('Tanggal harus format YYYY-MM-DD.');
    }
    const s = new Date(start + 'T00:00:00+07:00').getTime();
    const e = new Date(end + 'T23:59:59+07:00').getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) throw new Error('Tanggal tidak valid.');
    if (e < s) throw new Error('end_date harus >= start_date.');
    if ((e - s) / 86400000 > MAX_RANGE_DAYS) {
        throw new Error(`Rentang maksimum ${MAX_RANGE_DAYS} hari.`);
    }
    return { startIso: `${start}T00:00:00`, endIso: `${end}T23:59:59` };
}

/**
 * fetchPeriodSummary — aggregate revenue, expenses, transaction counts.
 *
 * @param mode - when provided, uses getReportPeriodRange() for period-aware boundaries (Type B).
 *               when omitted, uses validateDateRange() calendar-day boundaries (Type A).
 */
async function fetchPeriodSummary(
    start: string,
    end: string,
    location?: string,
    mode?: ReportPeriodMode,
): Promise<any> {
    const supabase = createServerClient();

    // Type B: period-aware boundaries via helper
    let checkinStart: string;
    let checkinEnd: string;
    if (mode) {
        const range = getReportPeriodRange(start, mode);
        checkinStart = range.start;
        checkinEnd = range.end;
    } else {
        // Type A: user-explicit calendar-day boundaries
        const { startIso, endIso } = validateDateRange(start, end);
        checkinStart = startIso;
        checkinEnd = endIso;
    }

    let txQuery = supabase
        .from('transactions')
        .select('cash_amount, transfer_amount, customer_name, room_number, apartment_location, marketing_name, marketing_fee', { count: 'exact' })
        .gte('checkin_at', checkinStart)
        .lte('checkin_at', checkinEnd);

    // pengeluaran.tanggal is date-only — always calendar-aligned
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

// ── Report-period-aware helpers ──────────────────────────────────────────────

/**
 * get_daily_summary — snap summary of today (and yesterday for comparison).
 * Respects report_period_mode from DB (calendar_day or hotel_day).
 * No parameters needed — uses system clock in Asia/Jakarta timezone.
 */
async function fetchDailySummary(): Promise<any> {
    const { format, subDays } = await import('date-fns');
    const { toZonedTime } = await import('date-fns-tz');
    const tz = 'Asia/Jakarta';
    const today = toZonedTime(new Date(), tz);
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');

    // Type B: fetch mode from DB for period-aware boundaries
    const mode = await getReportPeriodSetting();

    const [todayData, yesterdayData] = await Promise.all([
        fetchPeriodSummary(todayStr, todayStr, undefined, mode),
        fetchPeriodSummary(yesterdayStr, yesterdayStr, undefined, mode),
    ]);

    return {
        today: { date: todayStr, ...todayData },
        yesterday: { date: yesterdayStr, ...yesterdayData },
        comparison: {
            revenue_change: todayData.revenue - yesterdayData.revenue,
            transaction_change: todayData.transactions - yesterdayData.transactions,
        },
    };
}

/**
 * get_revenue_trend — daily revenue data points for a range.
 * Uses getReportPeriodRange() for period-aware boundaries.
 */
async function fetchRevenueTrend(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();

    // Fetch mode for period-aware boundaries
    const mode = await getReportPeriodSetting();
    const rangeStart = getReportPeriodRange(start, mode).start;
    const rangeEnd = getReportPeriodRange(end, mode).end;

    // Get distinct dates with revenue aggregated per day
    let q = supabase
        .from('transactions')
        .select('checkin_at, cash_amount, transfer_amount')
        .gte('checkin_at', rangeStart)
        .lte('checkin_at', rangeEnd);

    if (location) q = q.eq('apartment_location', location);

    const { data } = await q;
    if (!data || data.length === 0) {
        return { period: { start_date: start, end_date: end }, daily_revenue: [], total_revenue: 0 };
    }

    // Aggregate by date
    const byDate: Record<string, number> = {};
    for (const t of data) {
        const day = (t.checkin_at as string).slice(0, 10); // "YYYY-MM-DD"
        byDate[day] = (byDate[day] || 0) + (t.cash_amount || 0) + (t.transfer_amount || 0);
    }

    const daily = Object.entries(byDate)
        .map(([date, revenue]) => ({ date, revenue: Math.round(revenue) }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return {
        period: { start_date: start, end_date: end, location: location || null },
        total_revenue: daily.reduce((s, d) => s + d.revenue, 0),
        days: daily.length,
        daily_revenue: daily,
        avg_per_day: daily.length > 0 ? Math.round(daily.reduce((s, d) => s + d.revenue, 0) / daily.length) : 0,
        max_day: daily.length > 0 ? daily.reduce((a, b) => a.revenue > b.revenue ? a : b) : null,
        min_day: daily.length > 0 ? daily.reduce((a, b) => a.revenue < b.revenue ? a : b) : null,
    };
}

/**
 * get_latest_status — real-time snapshot of today's operations.
 * Equivalent to the dashboard "Ringkasan Hari Ini" card.
 * Respects report_period_mode from DB.
 */
async function fetchLatestStatus(): Promise<any> {
    const { format } = await import('date-fns');
    const { toZonedTime } = await import('date-fns-tz');
    const tz = 'Asia/Jakarta';
    const now = toZonedTime(new Date(), tz);
    const today = format(now, 'yyyy-MM-dd');

    const supabase = createServerClient();

    // Type B: use mode-aware today boundaries
    const { start: dayStart, end: dayEnd } = await getTodayReportRange();

    // Today's transactions (checked-in today)
    const { data: todayTx, count: txCount } = await supabase
        .from('transactions')
        .select('cash_amount, transfer_amount, status', { count: 'exact' })
        .gte('checkin_at', dayStart)
        .lte('checkin_at', dayEnd);

    // Active stays (currently checked-in)
    const nowIso = now.toISOString();
    const { count: activeStays } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .lte('checkin_at', nowIso)
        .gte('checkout_at', nowIso);

    // Checkouts today — use same period boundaries
    const { count: checkoutToday } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('checkout_at', dayStart)
        .lte('checkout_at', dayEnd);

    const revenueToday = (todayTx || []).reduce(
        (s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0
    );

    return {
        snapshot_time: format(now, 'yyyy-MM-dd HH:mm:ss'),
        today: {
            date: today,
            checkin_count: txCount || 0,
            checkout_count: checkoutToday || 0,
            revenue: Math.round(revenueToday),
            active_stays: activeStays || 0,
        },
    };
}

// ── New Tool Implementations (2026-05-27) ────────────────────────────────────

async function fetchSearchTransactions(query: string, startDate?: string, endDate?: string, location?: string, limit: number = 20): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('search_transactions', {
        p_query: query,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_location: location || null,
        p_limit: Math.min(limit, 100),
    });
    if (error) throw error;
    return { query, results: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchSearchExpenses(query: string, startDate?: string, endDate?: string, location?: string, category?: string, limit: number = 20): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('search_expenses', {
        p_query: query,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_location: location || null,
        p_category: category || null,
        p_limit: Math.min(limit, 100),
    });
    if (error) throw error;
    return { query, results: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchLiveCheckins(location?: string, limit: number = 50): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_live_checkins', {
        p_location: location || null,
        p_limit: Math.min(limit, 100),
    });
    if (error) throw error;
    return { snapshot_time: new Date().toISOString(), location: location || 'Semua Lokasi', active_guests: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchIdleUnits(daysThreshold: number = 7, location?: string, limit: number = 50): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('detect_idle_units', {
        p_days_threshold: daysThreshold,
        p_location: location || null,
        p_limit: Math.min(limit, 100),
    });
    if (error) throw error;
    return { threshold_days: daysThreshold, location: location || 'Semua Lokasi', idle_units: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchUnderperformingUnits(startDate: string, endDate: string, location?: string, threshold: number = 50, limit: number = 20): Promise<any> {
    validateDateRange(startDate, endDate);
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_underperforming_units', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_location: location || null,
        p_threshold: threshold,
        p_limit: Math.min(limit, 100),
    });
    if (error) throw error;
    return { period: { start_date: startDate, end_date: endDate }, threshold_occupancy: threshold, location: location || 'Semua Lokasi', underperforming_units: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchWeekendVsWeekday(startDate: string, endDate: string, location?: string): Promise<any> {
    validateDateRange(startDate, endDate);
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_weekend_vs_weekday_analysis', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_location: location || null,
    });
    if (error) throw error;
    return { period: { start_date: startDate, end_date: endDate }, location: location || 'Semua Lokasi', analysis: data || [] };
}

async function fetchMonthEndEstimate(year?: number, month?: number, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('estimate_month_end_revenue', {
        p_year: year || null,
        p_month: month || null,
        p_location: location || null,
    });
    if (error) throw error;
    return data?.[0] || { error: 'No data returned' };
}

async function fetchUnpaidBillsDetail(location?: string, limit: number = 50): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_unpaid_bills_detail', {
        p_location: location || null,
        p_limit: Math.min(limit, 100),
    });
    if (error) throw error;
    return { location: location || 'Semua Lokasi', unpaid_bills: data || [], total_count: data?.[0]?.total_count || 0, total_amount: data?.[0]?.total_amount || 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW TOOLS (2026-06-01) — 13 tools + 4 composite panel tools
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * fetchMarketingPerformance — performa marketing per nama.
 * Panggil RPC get_marketing_performance.
 */
async function fetchMarketingPerformance(start: string, end: string, location?: string, limit: number = 10): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_marketing_performance', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
        p_limit: Math.min(limit, 50),
        p_offset: 0,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        marketing: (data || []).filter((r: any) => r.marketing_name),
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchRepeatGuests — tamu yang berkunjung lebih dari 1x dalam periode.
 * Panggil RPC get_repeat_guests.
 */
async function fetchRepeatGuests(start: string, end: string, location?: string, limit: number = 10): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_repeat_guests', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
        p_limit: Math.min(limit, 50),
        p_offset: 0,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        repeat_guests: (data || []).filter((r: any) => r.customer_name),
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchStayDurationSummary — distribusi durasi menginap (transit, fullday, per malam).
 * Panggil RPC get_stay_duration_summary.
 */
async function fetchStayDurationSummary(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_stay_duration_summary', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        duration_distribution: data || [],
    };
}

/**
 * fetchGuestSourceSummary — sumber kedatangan tamu (marketing vs langsung).
 * Panggil RPC get_guest_source_summary.
 */
async function fetchGuestSourceSummary(start: string, end: string, location?: string, limit: number = 10): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_guest_source_summary', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
        p_limit: Math.min(limit, 50),
        p_offset: 0,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        sources: (data || []).filter((r: any) => r.source_name),
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchCheckinHeatmap — heatmap jam checkin (0-23) dalam periode.
 * Panggil RPC get_checkin_heatmap.
 */
async function fetchCheckinHeatmap(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_checkin_heatmap', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        hourly_distribution: data || [],
        peak_hour: (data || []).reduce((best: any, cur: any) => !best || cur.transaction_count > best.transaction_count ? cur : best, null),
    };
}

/**
 * fetchExpenseBreakdown — breakdown pengeluaran per kategori dalam periode.
 * Panggil RPC get_expense_breakdown_summary.
 */
async function fetchExpenseBreakdown(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_expense_breakdown_summary', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        breakdown: data || [],
    };
}

/**
 * fetchOccupancyPerLocation — occupancy rate per lokasi.
 * Panggil RPC get_occupancy_per_location.
 */
async function fetchOccupancyPerLocation(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_occupancy_per_location', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        locations: data || [],
    };
}

/**
 * fetchRevenueYoY — year-over-year comparison.
 * Panggil RPC get_revenue_yoy_comparison.
 */
async function fetchRevenueYoY(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_revenue_yoy_comparison', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        ...(data?.[0] || { current_revenue: 0, current_transactions: 0, previous_revenue: 0, previous_transactions: 0 }),
    };
}

/**
 * fetchPerformanceByEmployee — performa transaksi per karyawan.
 * Panggil RPC get_performance_by_employee.
 */
async function fetchPerformanceByEmployee(start: string, end: string, location?: string, limit: number = 10): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_performance_by_employee', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
        p_limit: Math.min(limit, 50),
        p_offset: 0,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        employees: (data || []).filter((r: any) => r.employee_name),
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchMonthlyRevenueTrend — tren revenue bulanan.
 * Panggil RPC get_monthly_revenue_trend.
 */
async function fetchMonthlyRevenueTrend(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_monthly_revenue_trend', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        monthly: data || [],
    };
}

/**
 * fetchNetProfitPerLocation — profit bersih per lokasi.
 * Panggil RPC get_net_profit_per_location.
 */
async function fetchNetProfitPerLocation(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_net_profit_per_location', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        locations: data || [],
    };
}

/**
 * fetchPaymentMethodSummary — ringkasan metode pembayaran per lokasi.
 * Panggil RPC get_payment_method_summary.
 */
async function fetchPaymentMethodSummary(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_payment_method_summary', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        locations: data || [],
    };
}

/**
 * fetchPerformanceByShift — performa per shift (pagi/siang/malam).
 * Panggil RPC get_performance_by_shift.
 */
async function fetchPerformanceByShift(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_performance_by_shift', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        shifts: data || [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE PANEL FETCHERS — reduce tool calls by bundling related data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * fetchDashboardKpiPanel — ONE call gets ALL dashboard KPIs.
 * Replaces: get_daily_summary + get_latest_status + get_period_summary + expense_breakdown
 */
async function fetchDashboardKpiPanel(start: string, end: string, location?: string): Promise<any> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_dashboard_kpis', {
        p_start_date: start,
        p_end_date: end,
        p_location: location || null,
    });
    const [expenseBreakdown, latestStatus, dailySummary] = await Promise.all([
        fetchExpenseBreakdown(start, end, location).catch(() => null),
        fetchLatestStatus().catch(() => null),
        fetchDailySummary().catch(() => null),
    ]);
    if (error) throw error;
    return {
        period: { start_date: start, end_date: end, location: location || null },
        kpis: data?.[0] || null,
        expense_breakdown: expenseBreakdown?.breakdown || [],
        latest_status: latestStatus?.today || null,
        daily_summary: dailySummary || null,
    };
}

/**
 * fetchMarketingPanel — ONE call gets marketing + guest sources + repeat guests + weekend analysis.
 * Replaces: get_marketing_performance + get_guest_source_summary + get_repeat_guests
 */
async function fetchMarketingPanel(start: string, end: string, location?: string): Promise<any> {
    const [marketing, guests, repeat, weekend] = await Promise.all([
        fetchMarketingPerformance(start, end, location, 20).catch(() => null),
        fetchGuestSourceSummary(start, end, location, 20).catch(() => null),
        fetchRepeatGuests(start, end, location, 10).catch(() => null),
        fetchWeekendVsWeekday(start, end, location).catch(() => null),
    ]);
    return {
        period: { start_date: start, end_date: end, location: location || null },
        marketing_performance: marketing?.marketing || [],
        guest_sources: guests?.sources || [],
        repeat_guests: repeat?.repeat_guests || [],
        weekend_vs_weekday: weekend?.analysis || [],
    };
}

/**
 * fetchOperationsPanel — ONE call gets occupancy + heatmap + employee perf + shift perf.
 * Replaces: get_occupancy_per_location + get_checkin_heatmap + get_performance_by_employee + get_performance_by_shift
 */
async function fetchOperationsPanel(start: string, end: string, location?: string): Promise<any> {
    const [occupancy, heatmap, employees, shifts, underperforming] = await Promise.all([
        fetchOccupancyPerLocation(start, end, location).catch(() => null),
        fetchCheckinHeatmap(start, end, location).catch(() => null),
        fetchPerformanceByEmployee(start, end, location, 10).catch(() => null),
        fetchPerformanceByShift(start, end, location).catch(() => null),
        fetchUnderperformingUnits(start, end, location, 50, 10).catch(() => null),
    ]);
    return {
        period: { start_date: start, end_date: end, location: location || null },
        occupancy_per_location: occupancy?.locations || [],
        checkin_heatmap: heatmap?.hourly_distribution || [],
        peak_hour: heatmap?.peak_hour || null,
        employee_performance: employees?.employees || [],
        shift_performance: shifts?.shifts || [],
        underperforming_units: underperforming?.underperforming_units || [],
    };
}

/**
 * fetchFinancialPanel — ONE call gets profit + YoY + monthly trend + payment methods.
 * Replaces: get_net_profit_per_location + get_revenue_yoy + get_monthly_revenue_trend + get_payment_method_summary
 */
async function fetchFinancialPanel(start: string, end: string, location?: string): Promise<any> {
    const [profit, yoy, monthly, payment, revenueTrend] = await Promise.all([
        fetchNetProfitPerLocation(start, end, location).catch(() => null),
        fetchRevenueYoY(start, end, location).catch(() => null),
        fetchMonthlyRevenueTrend(start, end, location).catch(() => null),
        fetchPaymentMethodSummary(start, end, location).catch(() => null),
        fetchRevenueTrend(start, end, location).catch(() => null),
    ]);
    return {
        period: { start_date: start, end_date: end, location: location || null },
        profit_per_location: profit?.locations || [],
        revenue_yoy: yoy ? {
            current_revenue: yoy.current_revenue,
            current_transactions: yoy.current_transactions,
            previous_revenue: yoy.previous_revenue,
            previous_transactions: yoy.previous_transactions,
            revenue_change_pct: yoy.revenue_change_pct,
            transactions_change_pct: yoy.transactions_change_pct,
        } : null,
        monthly_revenue_trend: monthly?.monthly || [],
        payment_methods: payment?.locations || [],
        daily_revenue_trend: revenueTrend?.daily_revenue || [],
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
    // ═══════════════════════════════════════════════════════════════════════════
    // META-TOOLS — Composite panels (reduce "too many tool calls" errors)
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'get_dashboard_kpi_panel',
            description:
                'PANEL DASHBOARD LENGKAP — SATU TOOL untuk semua KPI dashboard: revenue, expense, net profit, transaksi, occupancy, perbandingan periode sebelumnya, breakdown pengeluaran, status hari ini, ringkasan harian. **Gunakan ini untuk pertanyaan dashboard umum.** Menggantikan 4 tool calls sekaligus.',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD (inclusive)' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD (inclusive)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_marketing_panel',
            description:
                'PANEL MARKETING LENGKAP — SATU TOOL untuk semua data marketing: performa marketing, sumber tamu, repeat guests, analisis weekend vs weekday. **Gunakan untuk pertanyaan tentang marketing, guest sources, loyalitas.** Menggantikan 4 tool calls sekaligus.',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD (inclusive)' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD (inclusive)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_operations_panel',
            description:
                'PANEL OPERASIONAL LENGKAP — SATU TOOL untuk data operasional: occupancy per lokasi, heatmap jam checkin, performa karyawan, performa shift, unit underperforming. **Gunakan untuk pertanyaan tentang operasional, jam sibuk, kinerja karyawan.** Menggantikan 5 tool calls sekaligus.',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD (inclusive)' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD (inclusive)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_financial_panel',
            description:
                'PANEL KEUANGAN LENGKAP — SATU TOOL untuk semua data keuangan: profit per lokasi, YoY comparison, tren revenue bulanan, metode pembayaran, tren revenue harian. **Gunakan untuk pertanyaan tentang profit, perbandingan tahunan, analisis keuangan.** Menggantikan 5 tool calls sekaligus.',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD (inclusive)' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD (inclusive)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EXISTING TOOLS — Hari Ini (fast, no params)
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'get_daily_summary',
            description:
                'RINGKASAN HARI INI vs kemarin — revenue, transaksi, expense, lokasi. TANPA PARAMETER. Cepat. Gunakan untuk jawab "gimana kondisi hari ini?", "berapa revenue hari ini?", "ada berapa transaksi?".',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_latest_status',
            description:
                'STATUS REAL-TIME — total checkin hari ini, checkout, revenue, dan tamu yang sedang menginap sekarang. TANPA PARAMETER. Cocok untuk: "siapa yang lagi nginep?", "berapa checkin hari ini?", "status sekarang?".',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EXISTING TOOLS — Periode
    // ═══════════════════════════════════════════════════════════════════════════
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
            name: 'get_revenue_trend',
            description:
                'DATA TREN REVENUE HARIAN — dapatkan revenue per hari dalam rentang tertentu. Output array harian + rata-rata + hari maksimum/minimum. Berguna untuk: "gimana tren 7 hari terakhir?", "chart revenue", "hari apa revenue tertinggi?".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD (inclusive)' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD (inclusive)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
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

    // ═══════════════════════════════════════════════════════════════════════════
    // EXISTING TOOLS — Lokasi & Pelanggan
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // EXISTING TOOLS — Tagihan & Inventaris
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // EXISTING TOOLS — Search & Discovery
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'search_transactions',
            description: 'CARI TRANSAKSI — cari transaksi berdasarkan nama customer, nomor kamar, lokasi, atau ID. Pattern matching fleksibel. Berguna untuk: "cari transaksi atas nama X", "transaksi kamar 101", "siapa yang booking kemarin?".',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Kata kunci pencarian (nama, kamar, lokasi, ID)' },
                    start_date: { type: 'string', description: 'Filter tanggal mulai YYYY-MM-DD (opsional)' },
                    end_date: { type: 'string', description: 'Filter tanggal akhir YYYY-MM-DD (opsional)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 20, max 100' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_expenses',
            description: 'CARI PENGELUARAN — cari pengeluaran berdasarkan deskripsi, kategori, atau ID. Berguna untuk: "cari pengeluaran listrik", "expense bulan lalu kategori maintenance".',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Kata kunci pencarian (deskripsi, kategori, ID)' },
                    start_date: { type: 'string', description: 'Filter tanggal mulai YYYY-MM-DD (opsional)' },
                    end_date: { type: 'string', description: 'Filter tanggal akhir YYYY-MM-DD (opsional)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    category: { type: 'string', description: 'Filter kategori (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 20, max 100' },
                },
                required: ['query'],
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EXISTING TOOLS — Realtime & Monitoring
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'get_live_checkins',
            description: 'TAMU YANG SEDANG MENGINAP — daftar realtime tamu yang sedang check-in sekarang. Berguna untuk: "siapa yang lagi nginep?", "berapa tamu aktif sekarang?", "kamar mana yang terisi?".',
            parameters: {
                type: 'object',
                properties: {
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 50, max 100' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'detect_idle_units',
            description: 'DETEKSI UNIT IDLE — unit yang tidak ada transaksi dalam X hari terakhir. Berguna untuk: "kamar mana yang kosong lama?", "unit idle 7 hari", "deteksi unit tidak produktif".',
            parameters: {
                type: 'object',
                properties: {
                    days_threshold: { type: 'number', description: 'Threshold hari idle, default 7' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 50, max 100' },
                },
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EXISTING TOOLS — Analytics & Insights
    // ═══════════════════════════════════════════════════════════════════════════
    {
        type: 'function',
        function: {
            name: 'get_underperforming_units',
            description: 'UNIT UNDERPERFORMING — deteksi unit dengan occupancy rate atau revenue di bawah rata-rata. Berguna untuk: "unit mana yang performa buruk?", "kamar dengan revenue rendah", "analisis unit tidak optimal".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    threshold: { type: 'number', description: 'Threshold occupancy rate %, default 50' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 20, max 100' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_weekend_vs_weekday_analysis',
            description: 'ANALISIS WEEKEND VS WEEKDAY — perbandingan performa weekend (Sabtu-Minggu) vs weekday (Senin-Jumat). Berguna untuk: "lebih ramai weekend atau weekday?", "analisis pola hari", "revenue weekend vs weekday".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'estimate_month_end_revenue',
            description: 'PREDIKSI REVENUE AKHIR BULAN — estimasi revenue akhir bulan berdasarkan trend harian saat ini. Berguna untuk: "prediksi revenue bulan ini", "estimasi pendapatan akhir bulan", "proyeksi revenue".',
            parameters: {
                type: 'object',
                properties: {
                    year: { type: 'number', description: 'Tahun (opsional, default tahun ini)' },
                    month: { type: 'number', description: 'Bulan 1-12 (opsional, default bulan ini)' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_unpaid_bills_detail',
            description: 'DETAIL TAGIHAN UNPAID — daftar detail tagihan yang belum dibayar dengan aging analysis (0-30, 31-60, 61-90, 90+ hari). Berguna untuk: "tagihan yang belum dibayar", "aging analysis piutang", "overdue bills".',
            parameters: {
                type: 'object',
                properties: {
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 50, max 100' },
                },
            },
        },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // NEW TOOLS (2026-06-01) — 13 specialized tools
    // ═══════════════════════════════════════════════════════════════════════════

    // ── MARKETING & CUSTOMER ──────────────────────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'get_marketing_performance',
            description: 'PERFORMA MARKETING — breakdown transaksi, revenue, fee per marketing. Berguna untuk: "marketing mana paling produktif?", "berapa fee marketing?", "ROI marketing X?".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 10, max 50' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_repeat_guests',
            description: 'TAMU REPEAT — daftar tamu yang menginap lebih dari 1x dalam periode, berapa kali, total revenue. Berguna untuk: "siapa tamu loyal?", "customer paling sering booking?", "repeat guest analysis".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 10, max 50' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_guest_source_summary',
            description: 'SUMBER TAMU — dari mana tamu berasal (marketing atau langsung), berapa transaksi dan revenue per sumber. Berguna untuk: "berapa % tamu dari marketing?", "sumber tamu terbanyak?".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 10, max 50' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },

    // ── DURASI & WAKTU ───────────────────────────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'get_stay_duration_summary',
            description: 'DURASI MENGINAP — distribusi durasi menginap (transit, fullday, per malam, 2+ malam). Berguna untuk: "rata-rata durasi menginap?", "lebih banyak transit atau fullstay?", "pola durasi customer".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_checkin_heatmap',
            description: 'HEATMAP JAM CHECKIN — distribusi jam checkin (0-23) dalam periode. Berguna untuk: "jam berapa paling ramai checkin?", "pola jam operasional", "peak hour checkin".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_performance_by_shift',
            description: 'PERFORMA SHIFT — perbandingan performa shift (pagi/siang/malam): transaksi, revenue, rata-rata. Berguna untuk: "shift mana paling produktif?", "performa shift pagi vs malam?".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },

    // ── EXPENSE & KEUANGAN ───────────────────────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'get_expense_breakdown',
            description: 'BREAKDOWN PENGELUARAN — rincian pengeluaran per kategori, total, jumlah transaksi, persentase. Berguna untuk: "pengeluaran terbesar kategori apa?", "breakdown biaya", "analisis pengeluaran".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_net_profit_per_location',
            description: 'PROFIT PER LOKASI — revenue, expense, net profit, profit margin per lokasi. Berguna untuk: "lokasi mana paling menguntungkan?", "profit margin per lokasi", "analisis profitabilitas".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_payment_method_summary',
            description: 'METODE PEMBAYARAN — rasio cash vs transfer per lokasi, total dan persentase. Berguna untuk: "berapa % tamu bayar cash?", "preferensi metode bayar per lokasi".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },

    // ── OCCUPANCY & TREND ────────────────────────────────────────────────────
    {
        type: 'function',
        function: {
            name: 'get_occupancy_per_location',
            description: 'OCCUPANCY PER LOKASI — total kamar, transaksi, revenue, occupancy rate per lokasi. Berguna untuk: "lokasi mana occupancy tertinggi?", "rate okupansi per lokasi".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_revenue_yoy_comparison',
            description: 'YoY COMPARISON — perbandingan revenue dan transaksi tahun ini vs tahun lalu untuk periode yang sama. Berguna untuk: "performa tahun ini vs tahun lalu?", "growth YoY".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_monthly_revenue_trend',
            description: 'TREN REVENUE BULANAN — revenue, transaksi, rata-rata per transaksi per bulan dalam rentang. Berguna untuk: "tren revenue bulanan", "chart pendapatan per bulan".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                },
                required: ['start_date', 'end_date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_performance_by_employee',
            description: 'PERFORMA KARYAWAN — transaksi dan revenue per karyawan (input_by). Berguna untuk: "karyawan mana paling produktif?", "siapa yang paling banyak input transaksi?".',
            parameters: {
                type: 'object',
                properties: {
                    start_date: { type: 'string', description: 'Tanggal mulai YYYY-MM-DD' },
                    end_date: { type: 'string', description: 'Tanggal akhir YYYY-MM-DD' },
                    location: { type: 'string', description: 'Filter lokasi (opsional)' },
                    limit: { type: 'number', description: 'Jumlah hasil, default 10, max 50' },
                },
                required: ['start_date', 'end_date'],
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
            // ── COMPOSITE PANEL TOOLS ─────────────────────────────────────────
            case 'get_dashboard_kpi_panel':
                return await fetchDashboardKpiPanel(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_marketing_panel':
                return await fetchMarketingPanel(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_operations_panel':
                return await fetchOperationsPanel(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_financial_panel':
                return await fetchFinancialPanel(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            // ── EXISTING TOOLS ────────────────────────────────────────────────
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

            case 'get_daily_summary':
                return await fetchDailySummary();

            case 'get_latest_status':
                return await fetchLatestStatus();

            case 'get_revenue_trend':
                return await fetchRevenueTrend(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_outstanding_bills':
                return await fetchOutstandingBills(call.arguments.location);

            case 'get_unit_inventory':
                return await fetchUnitInventory(call.arguments.location);

            case 'search_transactions':
                return await fetchSearchTransactions(
                    call.arguments.query,
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                    call.arguments.limit || 20,
                );

            case 'search_expenses':
                return await fetchSearchExpenses(
                    call.arguments.query,
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                    call.arguments.category,
                    call.arguments.limit || 20,
                );

            case 'get_live_checkins':
                return await fetchLiveCheckins(
                    call.arguments.location,
                    call.arguments.limit || 50,
                );

            case 'detect_idle_units':
                return await fetchIdleUnits(
                    call.arguments.days_threshold || 7,
                    call.arguments.location,
                    call.arguments.limit || 50,
                );

            case 'get_underperforming_units':
                return await fetchUnderperformingUnits(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                    call.arguments.threshold || 50,
                    call.arguments.limit || 20,
                );

            case 'get_weekend_vs_weekday_analysis':
                return await fetchWeekendVsWeekday(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'estimate_month_end_revenue':
                return await fetchMonthEndEstimate(
                    call.arguments.year,
                    call.arguments.month,
                    call.arguments.location,
                );

            case 'get_unpaid_bills_detail':
                return await fetchUnpaidBillsDetail(
                    call.arguments.location,
                    call.arguments.limit || 50,
                );

            // ── NEW TOOLS (2026-06-01) ──────────────────────────────────────────
            case 'get_marketing_performance':
                return await fetchMarketingPerformance(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                    call.arguments.limit || 10,
                );

            case 'get_repeat_guests':
                return await fetchRepeatGuests(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                    call.arguments.limit || 10,
                );

            case 'get_guest_source_summary':
                return await fetchGuestSourceSummary(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                    call.arguments.limit || 10,
                );

            case 'get_stay_duration_summary':
                return await fetchStayDurationSummary(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_checkin_heatmap':
                return await fetchCheckinHeatmap(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_performance_by_shift':
                return await fetchPerformanceByShift(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_expense_breakdown':
                return await fetchExpenseBreakdown(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_net_profit_per_location':
                return await fetchNetProfitPerLocation(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_payment_method_summary':
                return await fetchPaymentMethodSummary(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_occupancy_per_location':
                return await fetchOccupancyPerLocation(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_revenue_yoy_comparison':
                return await fetchRevenueYoY(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_monthly_revenue_trend':
                return await fetchMonthlyRevenueTrend(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                );

            case 'get_performance_by_employee':
                return await fetchPerformanceByEmployee(
                    call.arguments.start_date,
                    call.arguments.end_date,
                    call.arguments.location,
                    call.arguments.limit || 10,
                );

            default:
                return { error: `Unknown tool: ${call.name}` };
        }
    } catch (err: any) {
        return { error: err?.message || 'Tool execution failed' };
    }
}
