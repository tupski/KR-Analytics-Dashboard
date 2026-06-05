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

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMPOSITE ROUTING STRATEGY — PRIORITAS TOOL PANEL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Gunakan composite panel tools FIRST sebelum tool individual:
 *
 *   get_dashboard_kpi_panel  → General business overview, dashboard KPI
 *   get_marketing_panel      → Marketing questions (performa marketing, sumber tamu)
 *   get_operations_panel     → Operational (occupancy, check-in, shift, employee)
 *   get_financial_panel      → Financial (profit, payment, revenue)
 *
 * Gunakan tool individual hanya untuk pertanyaan spesifik:
 *   get_occupancy_by_location    → Specific occupancy by location
 *   get_billing_breakdown        → Specific billing breakdown
 *   get_expense_breakdown        → Specific expense details (kategori)
 *   get_stay_duration_analysis   → Stay duration specifics
 *
 * RULES:
 *   - Max 1-3 tools per answer. Jika >3 diperlukan, minta user narrow question.
 *   - Untuk date questions: parse date/range dulu, baru call tool dengan
 *     exact startDate/endDate parameters.
 *   - Prefer composite panels → always use panel jika question covers multiple areas.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createServerClient } from '@/lib/supabase/server';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import { getTodayReportRange } from '@/lib/get-report-period-setting';
import { getReportPeriodRange } from '@/lib/reporting-period';
import { getNowWIB } from '@/lib/utils/format';
import type { ReportPeriodMode } from '@/lib/reporting-period';
import { queryAnalytics, parseNumeric } from '@/lib/analytics/db';
import { withCache, pickTTL } from '@/lib/analytics/cache';
import { getGuestStayHistory } from '@/lib/ai/tools/guest-history';
import { DATE_RANGE, API_LIMITS, IDLE_THRESHOLDS, TIME, LOCATION_HEALTH } from '@/lib/config/constants';

// ═══════════════════════════════════════════════════════════════════════════════
// Type Definitions — replace `any` types for proper type safety
// ═══════════════════════════════════════════════════════════════════════════════

/** Raw transaction record from Supabase */
export interface TransactionRecord {
    cash_amount: number;
    transfer_amount: number;
    customer_name?: string;
    room_number?: string;
    apartment_location?: string;
    marketing_name?: string;
    marketing_fee?: number;
    status?: string;
    checkin_at?: string;
    checkout_at?: string;
    rental_duration?: number;
    created_at?: string;
    is_deleted?: boolean;
}

/** Raw expense record from Supabase */
export interface ExpenseRecord {
    jumlah: number;
    category?: string;
    apartment_location?: string;
    tanggal?: string;
}

/** Raw billing record from Supabase */
export interface BillingRecord {
    amount: number;
    due_date?: string;
    status?: string;
    apartment_location?: string;
}

/** Period summary result from fetchPeriodSummary */
export interface PeriodSummary {
    period: { start_date: string; end_date: string; location: string | null };
    transactions: number;
    revenue: number;
    revenue_cash: number;
    revenue_transfer: number;
    marketing_fee_total: number;
    expense_total: number;
    net: number;
    distinct_customers: number;
    location_breakdown: { location: string; count: number; revenue: number }[];
    expense_by_category: { category: string; total: number }[];
}

/** Daily summary result */
export interface DailySummary {
    today: { date: string;[key: string]: unknown };
    yesterday: { date: string;[key: string]: unknown };
    comparison: { revenue_change: number; transaction_change: number };
}

/** Revenue trend result */
export interface RevenueTrend {
    period: { start_date: string; end_date: string; location: string | null };
    total_revenue: number;
    days: number;
    daily_revenue: { date: string; revenue: number }[];
    avg_per_day: number;
    max_day: { date: string; revenue: number } | null;
    min_day: { date: string; revenue: number } | null;
}

/** Latest status result */
export interface LatestStatus {
    snapshot_time: string;
    today: {
        date: string;
        checkin_count: number;
        checkout_count: number;
        revenue: number;
        active_stays: number;
    };
}

/** Generic search result */
export interface SearchResult {
    query: string;
    results: Record<string, unknown>[];
    total_count: number;
}

/** Live checkins result */
export interface LiveCheckinsResult {
    snapshot_time: string;
    location: string;
    active_guests: Record<string, unknown>[];
    total_count: number;
}

/** Idle units result */
export interface IdleUnitsResult {
    threshold_days: number;
    location: string;
    idle_units: Record<string, unknown>[];
    total_count: number;
}

/** Underperforming units result */
export interface UnderperformingUnitsResult {
    period: { start_date: string; end_date: string };
    threshold_occupancy: number;
    location: string;
    underperforming_units: Record<string, unknown>[];
    total_count: number;
}

/** Weekend vs weekday analysis result */
export interface WeekendWeekdayResult {
    period: { start_date: string; end_date: string };
    location: string;
    analysis: Record<string, unknown>[];
}

/** Month end estimate result */
export interface MonthEndEstimate {
    [key: string]: unknown;
}

/** Unpaid bills result */
export interface UnpaidBillsResult {
    location: string;
    unpaid_bills: Record<string, unknown>[];
    total_count: number;
    total_amount: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    if ((e - s) / TIME.MS_PER_DAY > DATE_RANGE.MAX_DAYS) {
        throw new Error(`Rentang maksimum ${DATE_RANGE.MAX_DAYS} hari.`);
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
): Promise<PeriodSummary> {
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
        (s: number, t: TransactionRecord) => s + (t.cash_amount || 0) + (t.transfer_amount || 0),
        0,
    );
    const cash = (txData || []).reduce((s: number, t: TransactionRecord) => s + (t.cash_amount || 0), 0);
    const transfer = (txData || []).reduce((s: number, t: TransactionRecord) => s + (t.transfer_amount || 0), 0);
    const marketingFeeTotal = (txData || []).reduce((s: number, t: TransactionRecord) => s + (t.marketing_fee || 0), 0);

    const distinctCustomers = new Set(
        (txData || [])
            .filter((t: TransactionRecord) => t.customer_name)
            .map((t: TransactionRecord) => String(t.customer_name).toLowerCase().trim()),
    ).size;

    const locationBreakdown: Record<string, { count: number; revenue: number }> = {};
    (txData || []).forEach((t: TransactionRecord) => {
        const loc = t.apartment_location || '(tanpa lokasi)';
        if (!locationBreakdown[loc]) locationBreakdown[loc] = { count: 0, revenue: 0 };
        locationBreakdown[loc].count++;
        locationBreakdown[loc].revenue += (t.cash_amount || 0) + (t.transfer_amount || 0);
    });

    const expenseTotal = (expData || []).reduce((s: number, e: ExpenseRecord) => s + (e.jumlah || 0), 0);
    const expenseByCategory: Record<string, number> = {};
    (expData || []).forEach((e: ExpenseRecord) => {
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
        top_locations: r.location_breakdown.slice(0, Math.min(limit, API_LIMITS.MAX_LOCATION_BREAKDOWN)),
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
    (data || []).forEach((t: TransactionRecord) => {
        if (!t.customer_name) return;
        const key = String(t.customer_name).toLowerCase().trim();
        if (!map[key]) map[key] = { visits: 0, revenue: 0, raw: t.customer_name };
        map[key].visits++;
        map[key].revenue += (t.cash_amount || 0) + (t.transfer_amount || 0);
    });

    const top = Object.values(map)
        .sort((a, b) => b.visits - a.visits || b.revenue - a.revenue)
        .slice(0, Math.min(limit, API_LIMITS.MAX_TOP_CUSTOMERS))
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
        const total = (data || []).reduce((s: number, b: BillingRecord) => s + (b.amount || 0), 0);
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

    const now = getNowWIB();
    let txQ = supabase
        .from('transactions')
        .select('room_number, apartment_location')
        .lte('checkin_at', now)
        .gte('checkout_at', now);
    if (location) txQ = txQ.eq('apartment_location', location);
    const { data: active } = await txQ;
    const occupied = new Set(
        (active || []).map((t) => `${t.apartment_location}-${t.room_number}`),
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
async function fetchDailySummary(): Promise<DailySummary> {
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
async function fetchRevenueTrend(start: string, end: string, location?: string): Promise<RevenueTrend> {
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
        return { period: { start_date: start, end_date: end, location: location || null }, total_revenue: 0, days: 0, daily_revenue: [], avg_per_day: 0, max_day: null, min_day: null };
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
async function fetchLatestStatus(): Promise<LatestStatus> {
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
    const nowIso = getNowWIB();
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
        (s: number, t: TransactionRecord) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0
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

async function fetchSearchTransactions(query: string, startDate?: string, endDate?: string, location?: string, limit: number = API_LIMITS.DEFAULT_PAGE_SIZE): Promise<SearchResult> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('search_transactions', {
        p_query: query,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_location: location || null,
        p_limit: Math.min(limit, API_LIMITS.MAX_PAGE_SIZE),
    });
    if (error) throw error;
    return { query, results: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchSearchExpenses(query: string, startDate?: string, endDate?: string, location?: string, category?: string, limit: number = API_LIMITS.DEFAULT_PAGE_SIZE): Promise<SearchResult> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('search_expenses', {
        p_query: query,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_location: location || null,
        p_category: category || null,
        p_limit: Math.min(limit, API_LIMITS.MAX_PAGE_SIZE),
    });
    if (error) throw error;
    return { query, results: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchLiveCheckins(location?: string, limit: number = API_LIMITS.MAX_IDLE_UNITS): Promise<LiveCheckinsResult> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_live_checkins', {
        p_location: location || null,
        p_limit: Math.min(limit, API_LIMITS.MAX_PAGE_SIZE),
    });
    if (error) throw error;
    return { snapshot_time: getNowWIB(), location: location || 'Semua Lokasi', active_guests: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchIdleUnits(daysThreshold: number = IDLE_THRESHOLDS.DEFAULT_QUERY_DAYS, location?: string, limit: number = API_LIMITS.MAX_IDLE_UNITS): Promise<IdleUnitsResult> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('detect_idle_units', {
        p_days_threshold: daysThreshold,
        p_location: location || null,
        p_limit: Math.min(limit, API_LIMITS.MAX_PAGE_SIZE),
    });
    if (error) throw error;
    return { threshold_days: daysThreshold, location: location || 'Semua Lokasi', idle_units: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchUnderperformingUnits(startDate: string, endDate: string, location?: string, threshold: number = LOCATION_HEALTH.LOW_OCCUPANCY_RATE, limit: number = API_LIMITS.MAX_UNDERPERFORMING_UNITS): Promise<UnderperformingUnitsResult> {
    validateDateRange(startDate, endDate);
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_underperforming_units', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_location: location || null,
        p_threshold: threshold,
        p_limit: Math.min(limit, API_LIMITS.MAX_PAGE_SIZE),
    });
    if (error) throw error;
    return { period: { start_date: startDate, end_date: endDate }, threshold_occupancy: threshold, location: location || 'Semua Lokasi', underperforming_units: data || [], total_count: data?.[0]?.total_count || 0 };
}

async function fetchWeekendVsWeekday(startDate: string, endDate: string, location?: string): Promise<WeekendWeekdayResult> {
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

async function fetchMonthEndEstimate(year?: number, month?: number, location?: string): Promise<MonthEndEstimate> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('estimate_month_end_revenue', {
        p_year: year || null,
        p_month: month || null,
        p_location: location || null,
    });
    if (error) throw error;
    return data?.[0] || { error: 'No data returned' };
}

async function fetchUnpaidBillsDetail(location?: string, limit: number = API_LIMITS.MAX_IDLE_UNITS): Promise<UnpaidBillsResult> {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_unpaid_bills_detail', {
        p_location: location || null,
        p_limit: Math.min(limit, API_LIMITS.MAX_PAGE_SIZE),
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
/** Generic RPC result row — RPC schemas may vary */
interface RpcResultRow {
    [key: string]: unknown;
    marketing_name?: string;
    customer_name?: string;
    source_name?: string;
    transaction_count?: number;
}

/** Marketing performance result */
interface MarketingPerformanceResult {
    period: { start_date: string; end_date: string; location: string | null };
    marketing: RpcResultRow[];
    total_count: number;
}

/** Repeat guests result */
interface RepeatGuestsResult {
    period: { start_date: string; end_date: string; location: string | null };
    repeat_guests: RpcResultRow[];
    total_count: number;
}

/** Stay duration result */
interface StayDurationResult {
    period: { start_date: string; end_date: string; location: string | null };
    duration_distribution: RpcResultRow[];
}

/** Guest source result */
interface GuestSourceResult {
    period: { start_date: string; end_date: string; location: string | null };
    sources: RpcResultRow[];
    total_count: number;
}

/** Checkin heatmap result */
interface CheckinHeatmapResult {
    period: { start_date: string; end_date: string; location: string | null };
    hourly_distribution: RpcResultRow[];
    peak_hour: RpcResultRow | null;
}

/** Expense breakdown result */
interface ExpenseBreakdownResult {
    period: { start_date: string; end_date: string; location: string | null };
    breakdown: RpcResultRow[];
}

/** Occupancy per location result */
interface OccupancyPerLocationResult {
    period: { start_date: string; end_date: string; location: string | null };
    locations: RpcResultRow[];
}

/** Revenue YoY result */
interface RevenueYoYResult {
    period: { start_date: string; end_date: string; location: string | null };
    current_revenue?: number;
    current_transactions?: number;
    previous_revenue?: number;
    previous_transactions?: number;
    revenue_change_pct?: number;
    transactions_change_pct?: number;
}

/** Employee performance result */
interface EmployeePerformanceResult {
    period: { start_date: string; end_date: string; location: string | null };
    employees: RpcResultRow[];
    total_count: number;
}

/** Monthly revenue trend result */
interface MonthlyRevenueTrendResult {
    period: { start_date: string; end_date: string; location: string | null };
    monthly: RpcResultRow[];
}

/** Net profit per location result */
interface NetProfitPerLocationResult {
    period: { start_date: string; end_date: string; location: string | null };
    locations: RpcResultRow[];
}

/** Payment method summary result */
interface PaymentMethodResult {
    period: { start_date: string; end_date: string; location: string | null };
    locations: RpcResultRow[];
}

/** Shift performance result */
interface ShiftPerformanceResult {
    period: { start_date: string; end_date: string; location: string | null };
    shifts: RpcResultRow[];
}

/** Generic RPC array result */
interface RpcArrayResult {
    period: { start_date: string; end_date: string; location: string | null };
    [key: string]: unknown;
}

async function fetchMarketingPerformance(start: string, end: string, location?: string, limit: number = 10): Promise<MarketingPerformanceResult> {
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
        marketing: (data || []).filter((r: RpcResultRow) => r.marketing_name) as RpcResultRow[],
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchRepeatGuests — tamu yang berkunjung lebih dari 1x dalam periode.
 * Panggil RPC get_repeat_guests.
 */
async function fetchRepeatGuests(start: string, end: string, location?: string, limit: number = 10): Promise<RepeatGuestsResult> {
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
        repeat_guests: (data || []).filter((r: RpcResultRow) => r.customer_name) as RpcResultRow[],
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchStayDurationSummary — distribusi durasi menginap (transit, fullday, per malam).
 * Panggil RPC get_stay_duration_summary.
 */
async function fetchStayDurationSummary(start: string, end: string, location?: string): Promise<StayDurationResult> {
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
async function fetchGuestSourceSummary(start: string, end: string, location?: string, limit: number = 10): Promise<GuestSourceResult> {
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
        sources: (data || []).filter((r: RpcResultRow) => r.source_name) as RpcResultRow[],
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchCheckinHeatmap — heatmap jam checkin (0-23) dalam periode.
 * Panggil RPC get_checkin_heatmap.
 */
async function fetchCheckinHeatmap(start: string, end: string, location?: string): Promise<CheckinHeatmapResult> {
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
        peak_hour: (data || []).reduce(
            (best: RpcResultRow | null, cur: RpcResultRow) =>
                !best || (cur.transaction_count ?? 0) > (best.transaction_count ?? 0) ? cur : best,
            null as RpcResultRow | null,
        ),
    };
}

/**
 * fetchExpenseBreakdown — breakdown pengeluaran per kategori dalam periode.
 * Panggil RPC get_expense_breakdown_summary (simple) atau analytics_expense_summary (extended).
 * Extended mode: support category filter + comparison data.
 */
async function fetchExpenseBreakdown(
    start: string,
    end: string,
    location?: string,
    category?: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
): Promise<ExpenseBreakdownResult> {
    // If extended params present, delegate to analytics DB version
    if (category || comparisonStartDate || comparisonEndDate) {
        return fetchExpenseBreakdownExtended(start, end, location, category, comparisonStartDate, comparisonEndDate);
    }

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
async function fetchOccupancyPerLocation(start: string, end: string, location?: string): Promise<OccupancyPerLocationResult> {
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
async function fetchRevenueYoY(start: string, end: string, location?: string): Promise<RevenueYoYResult> {
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
async function fetchPerformanceByEmployee(start: string, end: string, location?: string, limit: number = 10): Promise<EmployeePerformanceResult> {
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
        employees: (data || []).filter((r: RpcResultRow) => r.employee_name) as RpcResultRow[],
        total_count: data?.[0]?.total_count || 0,
    };
}

/**
 * fetchMonthlyRevenueTrend — tren revenue bulanan.
 * Panggil RPC get_monthly_revenue_trend.
 */
async function fetchMonthlyRevenueTrend(start: string, end: string, location?: string): Promise<MonthlyRevenueTrendResult> {
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
async function fetchNetProfitPerLocation(start: string, end: string, location?: string): Promise<NetProfitPerLocationResult> {
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
async function fetchPaymentMethodSummary(start: string, end: string, location?: string): Promise<PaymentMethodResult> {
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
// NEW ANALYTICS TOOLS (2026-06-01) — query analytics DB pool directly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * fetchCheckinBusyHours — check-in distribution by hour buckets.
 * Queries transactions mirror for checkin_at hour extraction with timezone.
 */
async function fetchCheckinBusyHours(
    startDate: string,
    endDate: string,
    location?: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
    reportPeriodMode?: string,
): Promise<any> {
    const params: Record<string, any> = { startDate, endDate, location, comparisonStartDate, comparisonEndDate, reportPeriodMode };
    return withCache('checkin_busy_hours', params, pickTTL(startDate, endDate), async () => {
        let whereClause = `t.is_deleted = false AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1::date AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $2::date`;
        const queryParams: any[] = [startDate, endDate];
        let paramIdx = 3;
        if (location) {
            whereClause += ` AND t.apartment_location = $${paramIdx++}`;
            queryParams.push(location);
        }

        const sql = `
            SELECT
                EXTRACT(HOUR FROM (t.created_at AT TIME ZONE 'Asia/Jakarta'))::INT as hour_bucket,
                COUNT(*)::INT as transaction_count,
                COALESCE(SUM(COALESCE(t.cash_amount,0) + COALESCE(t.transfer_amount,0)), 0) as total_revenue
            FROM transactions t
            WHERE ${whereClause}
            GROUP BY hour_bucket
            ORDER BY hour_bucket
        `;

        const rows = await queryAnalytics<any>(sql, queryParams);

        let comparison: any = null;
        if (comparisonStartDate && comparisonEndDate) {
            let compWhere = `t.is_deleted = false AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1::date AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $2::date`;
            const compParams: any[] = [comparisonStartDate, comparisonEndDate];
            let compIdx = 3;
            if (location) {
                compWhere += ` AND t.apartment_location = $${compIdx++}`;
                compParams.push(location);
            }
            const compRows = await queryAnalytics<any>(
                `SELECT EXTRACT(HOUR FROM (t.created_at AT TIME ZONE 'Asia/Jakarta'))::INT as hour_bucket,
                        COUNT(*)::INT as transaction_count
                 FROM transactions t WHERE ${compWhere}
                 GROUP BY hour_bucket ORDER BY hour_bucket`,
                compParams
            );
            comparison = { rows: compRows };
        }

        return {
            period: { start_date: startDate, end_date: endDate, location: location || null },
            hourly_distribution: rows,
            peak_hour: rows.length > 0
                ? rows.reduce((a: any, b: any) => a.transaction_count > b.transaction_count ? a : b)
                : null,
            comparison,
        };
    });
}

/**
 * fetchOccupancyByLocation — analyze occupancy per apartment location with comparison.
 * Uses analytics_occupancy_daily and nomor_kamar for total units.
 */
async function fetchOccupancyByLocation(
    startDate: string,
    endDate?: string,
    location?: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
    reportPeriodMode?: string,
): Promise<any> {
    const effectiveEnd = endDate || startDate;
    const params: Record<string, any> = { startDate, endDate: effectiveEnd, location, comparisonStartDate, comparisonEndDate, reportPeriodMode };
    return withCache('occupancy_by_location', params, pickTTL(startDate, effectiveEnd), async () => {
        // Get total units per location
        const totalUnitsSql = `SELECT lokasi, COUNT(*)::INT as total_units FROM nomor_kamar WHERE is_deleted = false GROUP BY lokasi`;
        const totalUnits = await queryAnalytics<any>(totalUnitsSql);

        let occWhere = `od.date_wib >= $1::date AND od.date_wib <= $2::date`;
        const occParams: any[] = [startDate, effectiveEnd];
        let occIdx = 3;
        if (location) {
            occWhere += ` AND od.apartment_location = $${occIdx++}`;
            occParams.push(location);
        }

        const occSql = `
            SELECT
                od.apartment_location,
                COUNT(DISTINCT od.room_number) as total_rooms_seen,
                COUNT(DISTINCT od.room_number) FILTER (WHERE od.is_occupied) as occupied_units,
                COUNT(DISTINCT od.date_wib) as days_count
            FROM analytics_occupancy_daily od
            WHERE ${occWhere}
            GROUP BY od.apartment_location
            ORDER BY od.apartment_location
        `;
        const occRows = await queryAnalytics<any>(occSql, occParams);

        // Compute occupancy rates and merge with total units
        const locations = occRows.map((r: any) => {
            const tu = totalUnits.find((u: any) => u.lokasi === r.apartment_location);
            const totalUnitsCount = tu ? parseNumeric(tu.total_units) : 0;
            const occupied = parseNumeric(r.occupied_units);
            const daysCount = Math.max(parseNumeric(r.days_count), 1);
            const dailyAvgOccupied = occupied / daysCount;
            const avgOccupancyRate = totalUnitsCount > 0 ? Math.round((dailyAvgOccupied / totalUnitsCount) * 10000) / 100 : 0;

            return {
                location_name: r.apartment_location,
                total_units: totalUnitsCount,
                occupied_units: Math.round(dailyAvgOccupied),
                vacant_units: totalUnitsCount - Math.round(dailyAvgOccupied),
                occupancy_rate: avgOccupancyRate,
            };
        });

        // Comparison data
        let comparison: any = null;
        if (comparisonStartDate && comparisonEndDate) {
            let compWhere = `od.date_wib >= $1::date AND od.date_wib <= $2::date`;
            const compParams: any[] = [comparisonStartDate, comparisonEndDate];
            let compIdx = 3;
            if (location) {
                compWhere += ` AND od.apartment_location = $${compIdx++}`;
                compParams.push(location);
            }
            const compRows = await queryAnalytics<any>(
                `SELECT od.apartment_location,
                        COUNT(DISTINCT od.room_number) FILTER (WHERE od.is_occupied) as occupied_units,
                        COUNT(DISTINCT od.date_wib) as days_count
                 FROM analytics_occupancy_daily od WHERE ${compWhere}
                 GROUP BY od.apartment_location`,
                compParams
            );
            const compMap: Record<string, any> = {};
            for (const r of compRows) {
                const tu = totalUnits.find((u: any) => u.lokasi === r.apartment_location);
                const totalUnitsCount = tu ? parseNumeric(tu.total_units) : 0;
                const daysCount = Math.max(parseNumeric(r.days_count), 1);
                compMap[r.apartment_location] = {
                    occupancy_rate: totalUnitsCount > 0
                        ? Math.round(((parseNumeric(r.occupied_units) / daysCount) / totalUnitsCount) * 10000) / 100
                        : 0,
                };
            }

            const withComparison = locations.map((loc: any) => {
                const prev = compMap[loc.location_name];
                const prevRate = prev?.occupancy_rate || 0;
                return {
                    ...loc,
                    previous_occupancy_rate: prevRate,
                    delta: Math.round((loc.occupancy_rate - prevRate) * 100) / 100,
                    trend: loc.occupancy_rate > prevRate ? 'up' : loc.occupancy_rate < prevRate ? 'down' : 'stable',
                };
            });
            comparison = { period: { start_date: comparisonStartDate, end_date: comparisonEndDate } };
            return { period: { start_date: startDate, end_date: effectiveEnd, location: location || null }, locations: withComparison, comparison };
        }

        return { period: { start_date: startDate, end_date: effectiveEnd, location: location || null }, locations };
    });
}

/**
 * fetchBillingBreakdownByCategory — breakdown billing/transactions by category.
 * Queries tagihan_bulanan for billing breakdown with comparison.
 */
async function fetchBillingBreakdownByCategory(
    startDate: string,
    endDate: string,
    location?: string,
    category?: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
): Promise<any> {
    const params: Record<string, any> = { startDate, endDate, location, category, comparisonStartDate, comparisonEndDate };
    return withCache('billing_breakdown', params, pickTTL(startDate, endDate), async () => {
        let whereClause = `t.is_deleted = false AND t.due_date >= $1::date AND t.due_date <= $2::date`;
        const queryParams: any[] = [startDate, endDate];
        let paramIdx = 3;
        if (location) {
            whereClause += ` AND t.apartment_location = $${paramIdx++}`;
            queryParams.push(location);
        }
        if (category) {
            whereClause += ` AND t.status = $${paramIdx++}`;
            queryParams.push(category);
        }

        const sql = `
            SELECT
                t.status as category,
                COALESCE(SUM(t.amount), 0) as total_amount,
                COUNT(*)::INT as transaction_count,
                ROUND(COALESCE(SUM(t.amount), 0) * 100.0 / NULLIF(SUM(SUM(t.amount)) OVER (), 0), 2) as percentage
            FROM tagihan_bulanan t
            WHERE ${whereClause}
            GROUP BY t.status
            ORDER BY total_amount DESC
        `;
        const rows = await queryAnalytics<any>(sql, queryParams);

        let comparison: any = null;
        if (comparisonStartDate && comparisonEndDate) {
            let compWhere = `t.is_deleted = false AND t.due_date >= $1::date AND t.due_date <= $2::date`;
            const compParams: any[] = [comparisonStartDate, comparisonEndDate];
            let compIdx = 3;
            if (location) {
                compWhere += ` AND t.apartment_location = $${compIdx++}`;
                compParams.push(location);
            }
            if (category) {
                compWhere += ` AND t.status = $${compIdx++}`;
                compParams.push(category);
            }
            const compRows = await queryAnalytics<any>(
                `SELECT t.status as category, COALESCE(SUM(t.amount), 0) as total_amount
                 FROM tagihan_bulanan t WHERE ${compWhere}
                 GROUP BY t.status`,
                compParams
            );
            const compMap: Record<string, number> = {};
            for (const r of compRows) compMap[r.category] = parseNumeric(r.total_amount);

            const withComparison = rows.map((r: any) => {
                const prev = compMap[r.category] || 0;
                return {
                    ...r,
                    total_amount: parseNumeric(r.total_amount),
                    previous_amount: prev,
                    delta: parseNumeric(r.total_amount) - prev,
                    trend: parseNumeric(r.total_amount) > prev ? 'up' : parseNumeric(r.total_amount) < prev ? 'down' : 'stable',
                };
            });
            comparison = { period: { start_date: comparisonStartDate, end_date: comparisonEndDate } };
            return { period: { start_date: startDate, end_date: endDate, location: location || null }, breakdown: withComparison, comparison };
        }

        return {
            period: { start_date: startDate, end_date: endDate, location: location || null },
            breakdown: rows.map((r: any) => ({ ...r, total_amount: parseNumeric(r.total_amount) })),
        };
    });
}

/**
 * fetchExpenseBreakdownExtended — extended version with comparison & category filter.
 * Uses analytics_expense_summary for fast aggregations.
 */
async function fetchExpenseBreakdownExtended(
    startDate: string,
    endDate: string,
    location?: string,
    category?: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
): Promise<any> {
    const params: Record<string, any> = { startDate, endDate, location, category, comparisonStartDate, comparisonEndDate };
    return withCache('expense_breakdown_ext', params, pickTTL(startDate, endDate), async () => {
        let whereClause = `e.date_wib >= $1::date AND e.date_wib <= $2::date`;
        const queryParams: any[] = [startDate, endDate];
        let paramIdx = 3;
        if (location) {
            whereClause += ` AND e.apartment_location = $${paramIdx++}`;
            queryParams.push(location);
        }
        if (category) {
            whereClause += ` AND e.category = $${paramIdx++}`;
            queryParams.push(category);
        }

        const sql = `
            SELECT
                e.category,
                COALESCE(SUM(e.total_amount), 0) as total_expense,
                COALESCE(SUM(e.expense_count), 0)::INT as transaction_count,
                ROUND(COALESCE(SUM(e.total_amount), 0) * 100.0 / NULLIF(SUM(SUM(e.total_amount)) OVER (), 0), 2) as percentage
            FROM analytics_expense_summary e
            WHERE ${whereClause}
            GROUP BY e.category
            ORDER BY total_expense DESC
        `;
        const rows = await queryAnalytics<any>(sql, queryParams);

        let comparison: any = null;
        if (comparisonStartDate && comparisonEndDate) {
            let compWhere = `e.date_wib >= $1::date AND e.date_wib <= $2::date`;
            const compParams: any[] = [comparisonStartDate, comparisonEndDate];
            let compIdx = 3;
            if (location) {
                compWhere += ` AND e.apartment_location = $${compIdx++}`;
                compParams.push(location);
            }
            if (category) {
                compWhere += ` AND e.category = $${compIdx++}`;
                compParams.push(category);
            }
            const compRows = await queryAnalytics<any>(
                `SELECT e.category, COALESCE(SUM(e.total_amount), 0) as total_expense
                 FROM analytics_expense_summary e WHERE ${compWhere}
                 GROUP BY e.category`,
                compParams
            );
            const compMap: Record<string, number> = {};
            for (const r of compRows) compMap[r.category] = parseNumeric(r.total_expense);

            const withComparison = rows.map((r: any) => {
                const prev = compMap[r.category] || 0;
                const curr = parseNumeric(r.total_expense);
                return {
                    category: r.category,
                    total_expense: curr,
                    transaction_count: parseNumeric(r.transaction_count),
                    percentage: parseNumeric(r.percentage),
                    previous_expense: prev,
                    delta: Math.round((curr - prev) * 100) / 100,
                    trend: curr > prev ? 'up' : curr < prev ? 'down' : 'stable',
                };
            });
            comparison = { period: { start_date: comparisonStartDate, end_date: comparisonEndDate } };
            return { period: { start_date: startDate, end_date: endDate, location: location || null }, breakdown: withComparison, comparison };
        }

        return {
            period: { start_date: startDate, end_date: endDate, location: location || null },
            breakdown: rows.map((r: any) => ({
                category: r.category,
                total_expense: parseNumeric(r.total_expense),
                transaction_count: parseNumeric(r.transaction_count),
                percentage: parseNumeric(r.percentage),
            })),
        };
    });
}

/**
 * fetchStayDurationAnalysis — analyze stay duration types with comparison.
 * Queries transactions mirror for rental_duration analysis.
 */
async function fetchStayDurationAnalysis(
    startDate: string,
    endDate: string,
    location?: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
): Promise<any> {
    const params: Record<string, any> = { startDate, endDate, location, comparisonStartDate, comparisonEndDate };
    return withCache('stay_duration_analysis', params, pickTTL(startDate, endDate), async () => {
        let whereClause = `t.is_deleted = false AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1::date AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $2::date`;
        const queryParams: any[] = [startDate, endDate];
        let paramIdx = 3;
        if (location) {
            whereClause += ` AND t.apartment_location = $${paramIdx++}`;
            queryParams.push(location);
        }

        const sql = `
            SELECT
                CASE
                    WHEN t.rental_duration = 0 THEN 'transit'
                    WHEN t.rental_duration = 1 THEN 'fullday'
                    WHEN t.rental_duration = 2 THEN 'promo_malam'
                    ELSE 'overnight_regular'
                END as duration_type,
                COUNT(*)::INT as booking_count,
                COALESCE(SUM(COALESCE(t.cash_amount,0) + COALESCE(t.transfer_amount,0)), 0) as revenue,
                ROUND(AVG(t.rental_duration), 2) as average_duration_hours,
                ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 2) as percentage
            FROM transactions t
            WHERE ${whereClause}
            GROUP BY duration_type
            ORDER BY booking_count DESC
        `;
        const rows = await queryAnalytics<any>(sql, queryParams);

        let comparison: any = null;
        if (comparisonStartDate && comparisonEndDate) {
            let compWhere = `t.is_deleted = false AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1::date AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $2::date`;
            const compParams: any[] = [comparisonStartDate, comparisonEndDate];
            let compIdx = 3;
            if (location) {
                compWhere += ` AND t.apartment_location = $${compIdx++}`;
                compParams.push(location);
            }
            const compRows = await queryAnalytics<any>(
                `SELECT CASE WHEN t.rental_duration = 0 THEN 'transit' WHEN t.rental_duration = 1 THEN 'fullday' WHEN t.rental_duration = 2 THEN 'promo_malam' ELSE 'overnight_regular' END as duration_type,
                        COUNT(*)::INT as booking_count, COALESCE(SUM(COALESCE(t.cash_amount,0) + COALESCE(t.transfer_amount,0)), 0) as revenue
                 FROM transactions t WHERE ${compWhere}
                 GROUP BY duration_type`,
                compParams
            );
            const compMap: Record<string, any> = {};
            for (const r of compRows) compMap[r.duration_type] = { booking_count: parseNumeric(r.booking_count), revenue: parseNumeric(r.revenue) };

            const withComparison = rows.map((r: any) => {
                const prev = compMap[r.duration_type];
                const currRevenue = parseNumeric(r.revenue);
                const prevRevenue = prev?.revenue || 0;
                return {
                    duration_type: r.duration_type,
                    booking_count: parseNumeric(r.booking_count),
                    revenue: currRevenue,
                    percentage: parseNumeric(r.percentage),
                    average_duration_hours: parseNumeric(r.average_duration_hours),
                    previous_booking_count: prev?.booking_count || 0,
                    previous_revenue: prevRevenue,
                    revenue_delta: Math.round((currRevenue - prevRevenue) * 100) / 100,
                    revenue_trend: currRevenue > prevRevenue ? 'up' : currRevenue < prevRevenue ? 'down' : 'stable',
                };
            });
            comparison = { period: { start_date: comparisonStartDate, end_date: comparisonEndDate } };
            return { period: { start_date: startDate, end_date: endDate, location: location || null }, duration_distribution: withComparison, comparison };
        }

        return {
            period: { start_date: startDate, end_date: endDate, location: location || null },
            duration_distribution: rows.map((r: any) => ({
                duration_type: r.duration_type,
                booking_count: parseNumeric(r.booking_count),
                revenue: parseNumeric(r.revenue),
                percentage: parseNumeric(r.percentage),
                average_duration_hours: parseNumeric(r.average_duration_hours),
            })),
        };
    });
}

/**
 * fetchWeekdayWeekendAnalysis — analyze weekday vs weekend performance.
 * Uses analytics_daily_revenue table with DOW extraction.
 */
async function fetchWeekdayWeekendAnalysis(
    startDate: string,
    endDate: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
    reportPeriodMode?: string,
): Promise<any> {
    const params: Record<string, any> = { startDate, endDate, comparisonStartDate, comparisonEndDate, reportPeriodMode };
    return withCache('weekday_weekend_analysis', params, pickTTL(startDate, endDate), async () => {
        const sql = `
            WITH day_classification AS (
                SELECT
                    date_wib,
                    CASE
                        WHEN EXTRACT(DOW FROM date_wib) IN (0, 6) THEN 'weekend'
                        ELSE 'weekday'
                    END as day_type,
                    total_revenue,
                    transaction_count,
                    unique_rooms
                FROM analytics_daily_revenue
                WHERE date_wib >= $1::date AND date_wib < $2::date
            )
            SELECT
                day_type,
                COALESCE(SUM(total_revenue), 0) as total_revenue,
                COALESCE(SUM(transaction_count), 0) as total_transactions,
                COALESCE(AVG(unique_rooms), 0) as avg_occupied_rooms,
                COUNT(DISTINCT date_wib) as day_count
            FROM day_classification
            GROUP BY day_type
        `;
        // Get today's progress for interpretation
        const { format } = await import('date-fns');
        const { toZonedTime } = await import('date-fns-tz');
        const tz = 'Asia/Jakarta';
        const nowInWib = toZonedTime(new Date(), tz);
        const todayStr = format(nowInWib, 'yyyy-MM-dd');
        const currentHour = nowInWib.getHours();
        const isEarlyDay = currentHour < 4; // 00:00-03:59 WIB = pergantian hari

        const rows = await queryAnalytics<any>(sql, [startDate, endDate]);

        const weekday = rows.find((r: any) => r.day_type === 'weekday');
        const weekend = rows.find((r: any) => r.day_type === 'weekend');

        // Comparison
        let comparison: any = null;
        if (comparisonStartDate && comparisonEndDate) {
            const compRows = await queryAnalytics<any>(`
                WITH day_classification AS (
                    SELECT date_wib,
                        CASE WHEN EXTRACT(DOW FROM date_wib) IN (0, 6) THEN 'weekend' ELSE 'weekday' END as day_type,
                        total_revenue, transaction_count, unique_rooms
                    FROM analytics_daily_revenue
                    WHERE date_wib >= $1::date AND date_wib < $2::date
                )
                SELECT day_type, COALESCE(SUM(total_revenue), 0) as total_revenue,
                       COALESCE(SUM(transaction_count), 0) as total_transactions
                FROM day_classification GROUP BY day_type
            `, [comparisonStartDate, comparisonEndDate]);
            const compWeekday = compRows.find((r: any) => r.day_type === 'weekday');
            const compWeekend = compRows.find((r: any) => r.day_type === 'weekend');

            const wdRev = parseNumeric(weekday?.total_revenue);
            const weRev = parseNumeric(weekend?.total_revenue);
            const compWdRev = parseNumeric(compWeekday?.total_revenue);
            const compWeRev = parseNumeric(compWeekend?.total_revenue);

            comparison = {
                period: { start_date: comparisonStartDate, end_date: comparisonEndDate },
                weekday_revenue_delta: wdRev - compWdRev,
                weekend_revenue_delta: weRev - compWeRev,
            };
        }

        return {
            period: { start_date: startDate, end_date: endDate },
            weekday_revenue: parseNumeric(weekday?.total_revenue),
            weekend_revenue: parseNumeric(weekend?.total_revenue),
            weekday_occupancy: parseNumeric(weekday?.avg_occupied_rooms),
            weekend_occupancy: parseNumeric(weekend?.avg_occupied_rooms),
            weekday_transactions: parseNumeric(weekday?.total_transactions),
            weekend_transactions: parseNumeric(weekend?.total_transactions),
            weekday_days: parseNumeric(weekday?.day_count),
            weekend_days: parseNumeric(weekend?.day_count),
            current_day_progress: { date: todayStr, hour: currentHour, is_early_day: isEarlyDay },
            is_early_day: isEarlyDay,
            interpretation_text: isEarlyDay
                ? `Hari ini baru mulai (${currentHour}:00 WIB). Data mungkin belum mewakili kondisi penuh hari ini.`
                : `Data mencakup periode ${startDate} hingga ${endDate}.`,
            comparison,
        };
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GUEST STAY HISTORY (2026-06-01)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * fetchGuestStayHistory — cari riwayat menginap tamu berdasarkan nama.
 * Query langsung ke analytics PostgreSQL via queryAnalytics.
 * SELECT-only, parameterized query.
 */
async function fetchGuestStayHistory(
    guestName: string,
    startDate?: string,
    endDate?: string,
    location?: string,
    roomNumber?: string,
    fuzzyMatch: boolean = true,
    limit: number = 20,
): Promise<any> {
    if (!guestName || !guestName.trim()) {
        return { error: 'Nama tamu wajib diisi.' };
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const normalizedName = guestName.trim().replace(/\s+/g, ' ');

    // Step 1: Find matching customer names (case-insensitive ILIKE)
    let nameQuery = `SELECT DISTINCT customer_name, COUNT(*)::INT as stay_count
FROM transactions
WHERE customer_name ILIKE $1`;
    const nameParams: any[] = [`%${normalizedName}%`];
    let paramIdx = 2;

    if (startDate) {
        nameQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $${paramIdx}::date`;
        nameParams.push(startDate);
        paramIdx++;
    }
    if (endDate) {
        nameQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $${paramIdx}::date`;
        nameParams.push(endDate);
        paramIdx++;
    }
    if (location) {
        nameQuery += ` AND apartment_location = $${paramIdx}`;
        nameParams.push(location);
        paramIdx++;
    }
    if (roomNumber) {
        nameQuery += ` AND room_number ILIKE $${paramIdx}`;
        nameParams.push(`%${roomNumber}%`);
        paramIdx++;
    }

    nameQuery += ` GROUP BY customer_name ORDER BY stay_count DESC LIMIT 20`;

    const nameRows = await queryAnalytics<any>(nameQuery, nameParams);

    if (!nameRows || nameRows.length === 0) {
        return {
            guestName: normalizedName,
            totalStays: 0,
            stays: [],
            matches: [],
        };
    }

    // If multiple matches, return matches array for clarification
    if (nameRows.length > 1) {
        return {
            guestName: normalizedName,
            totalStays: 0,
            stays: [],
            matches: nameRows.map((r: any) => ({
                guestName: r.customer_name,
                matchScore: Math.round(
                    (normalizedName.toLowerCase().split(' ').filter((w: string) =>
                        r.customer_name.toLowerCase().includes(w)
                    ).length / Math.max(normalizedName.split(' ').length, 1)) * 100
                ),
            })),
            message: `Ditemukan ${nameRows.length} nama mirip. Mohon klarifikasi nama tamu yang dimaksud.`,
        };
    }

    // Single clear match — fetch full stay history
    const matchedName = nameRows[0].customer_name;

    let staysQuery = `SELECT
    (created_at AT TIME ZONE 'Asia/Jakarta')::DATE as check_in_date,
    (checkout_at AT TIME ZONE 'Asia/Jakarta')::DATE as check_out_date,
    apartment_location as location_name,
    room_number,
    rental_duration,
    CASE
        WHEN rental_duration = 0 THEN 'Transit'
        WHEN rental_duration = 1 THEN 'Fullday'
        WHEN rental_duration = 2 THEN 'Promo 2 Malam'
        ELSE rental_duration::TEXT || ' Malam'
    END as duration_label,
    marketing_name as booking_source,
    COALESCE(cash_amount, 0) + COALESCE(transfer_amount, 0) as amount,
    status,
    is_deleted
FROM transactions
WHERE customer_name = $1`;
    const stayParams: any[] = [matchedName];
    let stayIdx = 2;

    if (startDate) {
        staysQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $${stayIdx}::date`;
        stayParams.push(startDate);
        stayIdx++;
    }
    if (endDate) {
        staysQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $${stayIdx}::date`;
        stayParams.push(endDate);
        stayIdx++;
    }
    if (location) {
        staysQuery += ` AND apartment_location = $${stayIdx}`;
        stayParams.push(location);
        stayIdx++;
    }
    if (roomNumber) {
        staysQuery += ` AND room_number ILIKE $${stayIdx}`;
        stayParams.push(`%${roomNumber}%`);
        stayIdx++;
    }

    staysQuery += ` ORDER BY (created_at AT TIME ZONE 'Asia/Jakarta')::DATE DESC LIMIT ${safeLimit}`;

    const stays = await queryAnalytics<any>(staysQuery, stayParams);

    // Calculate total revenue
    const totalRevenue = (stays || []).reduce(
        (sum: number, s: any) => sum + (parseFloat(s.amount) || 0),
        0,
    );

    return {
        guestName: matchedName,
        totalStays: stays?.length || 0,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        stays: (stays || [])
            .filter((s: any) => !s.is_deleted)
            .map((s: any) => ({
                checkInDate: s.check_in_date,
                checkOutDate: s.check_out_date || null,
                locationName: s.location_name,
                roomNumber: s.room_number,
                durationLabel: s.duration_label,
                bookingSource: s.booking_source || '(langsung)',
                amount: Math.round(parseFloat(s.amount) * 100) / 100,
                status: s.status || 'completed',
            })),
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
    // COMPOSITE PANEL TOOLS — bundle multiple metrics into one call
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
    // CORE TOOLS — search, inventory, live, bills, comparison
    // ═══════════════════════════════════════════════════════════════════════════
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
    {
        type: 'function',
        function: {
            name: 'get_guest_stay_history',
            description: 'RIWAYAT MENGINAP TAMU — cari riwayat menginap tamu berdasarkan nama. Gunakan ILIKE case-insensitive, dukung partial name. Jika ada beberapa nama mirip, return daftar matches untuk klarifikasi. Jika satu kecocokan jelas, return semua riwayat menginap detail. Output: guestName, totalStays, totalRevenue, stays[] (checkInDate, checkOutDate, locationName, roomNumber, durationLabel, bookingSource, amount, status). JANGAN tebak data dari memori — selalu pakai tool ini untuk pertanyaan nama tamu.',
            parameters: {
                type: 'object',
                properties: {
                    guestName: { type: 'string', description: 'Nama tamu yang dicari (partial name OK, case-insensitive)' },
                    startDate: { type: 'string', description: 'Filter tanggal mulai YYYY-MM-DD (opsional)' },
                    endDate: { type: 'string', description: 'Filter tanggal akhir YYYY-MM-DD (opsional)' },
                    location: { type: 'string', description: 'Filter lokasi apartemen (opsional)' },
                    roomNumber: { type: 'string', description: 'Filter nomor kamar (opsional)' },
                    fuzzyMatch: { type: 'boolean', description: 'Gunakan fuzzy matching (default: true)' },
                    limit: { type: 'number', description: 'Jumlah hasil maksimum, default 20, max 100' },
                },
                required: ['guestName'],
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

            // ── CORE TOOLS ──────────────────────────────────────────────────────
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
            case 'get_unpaid_bills_detail':
                return await fetchUnpaidBillsDetail(
                    call.arguments.location,
                    call.arguments.limit || 50,
                );

            case 'get_guest_stay_history':
                return await getGuestStayHistory(
                    call.arguments.guestName,
                    call.arguments.startDate,
                    call.arguments.endDate,
                    call.arguments.location,
                    call.arguments.roomNumber,
                    call.arguments.fuzzyMatch,
                    call.arguments.limit,
                );

            default:
                return { error: `Unknown tool: ${call.name}` };
        }
    } catch (err: any) {
        return { error: err?.message || 'Tool execution failed' };
    }
}
