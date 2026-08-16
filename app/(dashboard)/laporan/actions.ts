'use server';

import { createServerClient } from '@/lib/supabase/server';
import { format, addDays, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getDateRange, getPreviousDateRange, computeDateRange, computeComparisonRange, isMonthAligned, type DateFilter } from '@/lib/services/date-range';
import type { DateFilterParams } from '@/lib/services/date-range';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import { getRevenueSummary } from '@/lib/services/revenue';
import { getExpenseSummary } from '@/lib/services/expense';
import { getMonthlySummaries } from '@/lib/analytics/monthly';
import { queryAnalytics, parseNumeric } from '@/lib/analytics/db';
import { isAnalyticsTableFresh } from '@/lib/analytics/sync-freshness';
import type { ReportPeriodRange } from '@/lib/shared/report-period';
import { withEgressCache, egressCacheKey } from '@/lib/egress-cache';
import { CACHE_TTL } from '@/lib/config/constants';
import type { ServerSupabaseClient } from '@/lib/supabase/server';

export type { DateFilter };

/**
 * Build a minimal ReportPeriodRange from ISO datetime strings.
 * Used as a bridge for callers that still work with string-based ranges.
 */
function buildPeriodFromISO(startISO: string, endISO: string): ReportPeriodRange {
    const endDateISO = new Date(endISO);
    const endExclusiveDateObj = addDays(endDateISO, 1);
    const excY = endExclusiveDateObj.getFullYear();
    const excM = String(endExclusiveDateObj.getMonth() + 1).padStart(2, '0');
    const excD = String(endExclusiveDateObj.getDate()).padStart(2, '0');
    const endExclusiveDate = `${excY}-${excM}-${excD}`;
    const endExclusiveISO = `${endExclusiveDate}T00:00:00.000+07:00`;

    return {
        preset: 'custom',
        mode: 'calendar_day',
        timezone: 'Asia/Jakarta',
        start: new Date(startISO),
        end: new Date(endISO),
        startISO,
        endISO,
        startDate: startISO.split('T')[0],
        endDate: endISO.split('T')[0],
        endExclusiveISO,
        endExclusiveDate,
        label: `${startISO} – ${endISO}`,
    };
}

export interface LocationReport {
    name: string;
    totalRooms: number;
    transactions: number;
    revenue: number;
    rooms: RoomReport[];
    totalExpenses: number;
}

export interface RoomReport {
    roomNumber: string;
    location: string;
    transactions: number;
    revenue: number;
    occupancyRate: number;
}

export interface RoomDetail {
    id: number;
    customerName: string;
    checkinAt: string;
    checkoutAt: string;
    rentalDuration: number;
    cashAmount: number;
    transferAmount: number;
    transferTo: string | null;
    marketingName: string | null;
    marketingFee: number;
    inputBy: string | null;
    shift: string | null;
}

export interface ExpenseReport {
    category: string;
    total: number;
    count: number;
}

export interface TagihanReport {
    paid: number;
    unpaid: number;
    paidCount: number;
    unpaidCount: number;
}

export interface FeeMarketingReport {
    totalPaid: number;
    totalUnpaid: number;
    paidCount: number;
    unpaidCount: number;
}

export interface LaporanData {
    filter: DateFilter;
    filterLabel: string;
    // Revenue
    totalRevenue: number;
    totalTransactions: number;
    totalCash: number;
    totalTransfer: number;
    // Locations
    locations: LocationReport[];
    // Expenses
    expenses: ExpenseReport[];
    totalExpenses: number;
    expensesPerLocation: Record<string, { category: string; total: number; count: number }[]>;
    roomExpensesMap?: Record<string, { hasExpenses: boolean; count: number; total: number }>;
    // Tagihan
    tagihan: TagihanReport;
    // Fee Marketing
    feeMarketing: FeeMarketingReport;
    // Comparison
    comparison?: {
        prevRevenue: number;
        prevTransactions: number;
        prevExpenses: number;
        prevLabel: string;
    };
}

/**
 * Pick a cache TTL for a laporan period scan.
 * Closed historical periods are immutable → 24h. Today/current ranges use the
 * existing constants (5m today, 15m week, 30m month) — mirrors the plan §3.1
 * laporan summary TTL rule.
 */
function laporanTtlFor(startISO: string, endISO: string): number {
    const now = new Date();
    const end = new Date(endISO);
    if (end.getTime() < now.getTime()) return CACHE_TTL.HISTORICAL_CLOSED; // 24h
    const start = new Date(startISO);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    if (days <= 3) return CACHE_TTL.DASHBOARD_TODAY; // 5 min
    if (days <= 14) return CACHE_TTL.DASHBOARD_WEEK; // 15 min
    return CACHE_TTL.DASHBOARD_MONTH; // 30 min
}

/**
 * Egress P1 (Q36/Q37): tagihan_bulanan paid/unpaid is an ALL-TIME outstanding
 * query — the UI shows "Lunas"/"Belum Bayar" cards with NO period label
 * (components/laporan/LaporanClient.tsx:148-164). A due_date bound would change
 * the reported totals, so NO date bound is applied. Instead the all-time
 * aggregate is cached (30 min); the two legacy copies (analytics catch + else
 * branch) are consolidated into this single cached helper.
 */
async function fetchTagihanReport(supabase: ServerSupabaseClient): Promise<TagihanReport> {
    return withEgressCache(egressCacheKey('tagihan_bulanan', 'paid-unpaid'), CACHE_TTL.DASHBOARD_MONTH, async () => {
        // Analytics-first: all-time paid/unpaid from the local mirror
        if (process.env.ANALYTICS_DATABASE_URL) {
            try {
                const rows = await queryAnalytics<{ status: string; amount: string | number | null }>(
                    `SELECT status, amount FROM tagihan_bulanan WHERE is_deleted = FALSE`
                );
                if (rows.length > 0) {
                    const paid = rows.filter(r => r.status === 'paid');
                    const unpaid = rows.filter(r => r.status === 'unpaid');
                    return {
                        paid: paid.reduce((s, r) => s + parseNumeric(r.amount), 0),
                        unpaid: unpaid.reduce((s, r) => s + parseNumeric(r.amount), 0),
                        paidCount: paid.length,
                        unpaidCount: unpaid.length,
                    };
                }
            } catch (e) {
                console.warn('[Laporan] tagihan_bulanan mirror read failed, using Supabase:', e);
            }
        }

        const { data: tagihanPaid } = await supabase
            .from('tagihan_bulanan')
            .select('amount')
            .eq('status', 'paid');
        const { data: tagihanUnpaid } = await supabase
            .from('tagihan_bulanan')
            .select('amount')
            .eq('status', 'unpaid');

        return {
            paid: tagihanPaid?.reduce((s, t: any) => s + (t.amount || 0), 0) || 0,
            unpaid: tagihanUnpaid?.reduce((s, t: any) => s + (t.amount || 0), 0) || 0,
            paidCount: tagihanPaid?.length || 0,
            unpaidCount: tagihanUnpaid?.length || 0,
        };
    });
}

/**
 * Egress P1 (Q36/Q37): tagihan_fee_lunas_items is also all-time —
 * totalUnpaid = period marketing_fee total MINUS all-time paid fees, so the
 * paid side cannot be date-bounded without changing numbers. Cached (30 min).
 */
async function fetchFeePaidAggregate(supabase: ServerSupabaseClient): Promise<{ totalPaid: number; paidCount: number }> {
    return withEgressCache(egressCacheKey('tagihan_fee_lunas_items', 'paid-aggregate'), CACHE_TTL.DASHBOARD_MONTH, async () => {
        // Analytics-first: all-time paid fees from the local mirror
        if (process.env.ANALYTICS_DATABASE_URL) {
            try {
                const rows = await queryAnalytics<{ fee_amount: string | number | null }>(
                    `SELECT fee_amount FROM tagihan_fee_lunas_items WHERE is_deleted = FALSE`
                );
                if (rows.length > 0) {
                    return {
                        totalPaid: rows.reduce((s, r) => s + parseNumeric(r.fee_amount), 0),
                        paidCount: rows.length,
                    };
                }
            } catch (e) {
                console.warn('[Laporan] tagihan_fee_lunas_items mirror read failed, using Supabase:', e);
            }
        }

        const { data: feePaid } = await supabase
            .from('tagihan_fee_lunas_items')
            .select('fee_amount');
        return {
            totalPaid: feePaid?.reduce((s, f: any) => s + (f.fee_amount || 0), 0) || 0,
            paidCount: feePaid?.length || 0,
        };
    });
}

interface LocalTxRow {
    checkin_at: string | null;
    created_at: string | null;
    cash_amount: number;
    transfer_amount: number;
    apartment_location: string | null;
    room_number: string | null;
    marketing_fee: number;
}

/**
 * Read the local transactions mirror for a period (analytics-first).
 * Returns null when the mirror is unavailable / stale for a current period /
 * empty — the caller then falls back to Supabase. Mirror NUMERIC values are
 * normalized to numbers to match PostgREST row shapes.
 * ponytail: per-table freshness thresholds via sync_metadata config columns;
 * switch to an updated_at watermark once production transactions has one.
 */
async function readTransactionsLocal(period: ReportPeriodRange, isCurrent: boolean): Promise<LocalTxRow[] | null> {
    if (!process.env.ANALYTICS_DATABASE_URL) return null;
    if (isCurrent && !(await isAnalyticsTableFresh('transactions'))) {
        console.debug('[Laporan] transactions mirror stale, using Supabase for current period');
        return null;
    }
    try {
        const rows = await queryAnalytics<{
            checkin_at: string | null;
            created_at: string | null;
            cash_amount: string | number | null;
            transfer_amount: string | number | null;
            apartment_location: string | null;
            room_number: string | null;
            marketing_fee: string | number | null;
        }>(
            `SELECT checkin_at, created_at, cash_amount, transfer_amount,
                    apartment_location, room_number, marketing_fee
             FROM transactions
             WHERE is_deleted = FALSE
               AND (checkin_at >= $1 OR (checkin_at IS NULL AND created_at >= $1))`,
            [period.startISO]
        );
        if (rows.length === 0) return null; // empty mirror → fallback (empty is NOT truth)
        return rows.map(r => ({
            checkin_at: r.checkin_at,
            created_at: r.created_at,
            cash_amount: parseNumeric(r.cash_amount),
            transfer_amount: parseNumeric(r.transfer_amount),
            apartment_location: r.apartment_location,
            room_number: r.room_number,
            marketing_fee: parseNumeric(r.marketing_fee),
        }));
    } catch (err) {
        console.warn('[Laporan] transactions mirror read failed, using Supabase:', err);
        return null;
    }
}

/**
 * Read the local pengeluaran mirror for a date range (analytics-first).
 * Returns null → Supabase fallback. Same empty/stale rules as transactions.
 */
async function readExpensesLocal(
    startDate: string,
    endDate: string,
    isCurrent: boolean,
): Promise<{ category: string | null; jumlah: number; apartment_location: string | null; room_number: string | null }[] | null> {
    if (!process.env.ANALYTICS_DATABASE_URL) return null;
    if (isCurrent && !(await isAnalyticsTableFresh('pengeluaran'))) return null;
    try {
        const rows = await queryAnalytics<{
            category: string | null;
            jumlah: string | number | null;
            apartment_location: string | null;
            room_number: string | null;
        }>(
            `SELECT category, jumlah, apartment_location, room_number
             FROM pengeluaran
             WHERE is_deleted = FALSE AND tanggal >= $1 AND tanggal <= $2`,
            [startDate, endDate]
        );
        if (rows.length === 0) return null;
        return rows.map(r => ({
            category: r.category,
            jumlah: parseNumeric(r.jumlah),
            apartment_location: r.apartment_location,
            room_number: r.room_number,
        }));
    } catch (err) {
        console.warn('[Laporan] pengeluaran mirror read failed, using Supabase:', err);
        return null;
    }
}

export async function fetchLaporanData(
    filter: DateFilter = 'today',
    dateParams?: DateFilterParams,
): Promise<LaporanData> {
    const supabase = createServerClient();
    const mode = await getReportPeriodSetting();

    // Use unified date params if provided, else fall back to legacy DateFilter
    const range = dateParams?.rangePreset
        ? computeDateRange(dateParams.rangePreset, dateParams.startDate, dateParams.endDate, mode)
        : getDateRange(filter, mode);
    const { start, end, label } = range;
    const startDateStr = start.split('T')[0];
    const endDateStr = end.split('T')[0];

    // Analytics-first: serve the period scan from the local transactions mirror
    // (sync-worker), falling back to Supabase when the mirror is unavailable,
    // stale for a current period, or empty. Egress P1: cached per exact
    // (start, end, mode) — the cache stores whichever source won.
    const period = buildPeriodFromISO(start, end);
    const todayWIB = format(toZonedTime(new Date(), 'Asia/Jakarta'), 'yyyy-MM-dd');
    const isCurrent = period.endExclusiveDate > todayWIB;

    const txList = await withEgressCache(
        egressCacheKey('transactions', 'laporan-scan', start, end, mode),
        laporanTtlFor(start, end),
        async () => {
            const local = await readTransactionsLocal(period, isCurrent);
            if (local) return local;
            const { data } = await supabase
                .from('transactions')
                .select('checkin_at, created_at, cash_amount, transfer_amount, apartment_location, room_number, marketing_fee')
                .or(`checkin_at.gte.${start},and(checkin_at.is.null,created_at.gte.${start})`)
                .order('checkin_at', { ascending: false });
            return data || [];
        },
    );

    // ── REVENUE (computed from txList, analytics fallback) ──

    // Fetch analytics summary for fallback
    let revenueSummary: { totalRevenue: number; transactionCount: number } | null = null;
    if (mode !== 'hotel_day') {
        try {
            revenueSummary = await getRevenueSummary(period);
        } catch (e) {
            console.warn('[Laporan] Analytics revenue check failed:', e);
        }
    }

    // Always compute from local txList using numeric epoch comparison
    // (avoids string-based ISO comparison bug between UTC PostgREST timestamps and WIB period bounds)
    const filtered = txList.filter((t: any) => {
        const effDate = t.checkin_at ?? t.created_at;
        if (!effDate) return false;
        const eff = new Date(effDate).getTime();
        const s = new Date(period.startISO).getTime();
        const e = new Date(period.endExclusiveISO).getTime();
        return eff >= s && eff < e;
    });
    const rawRevenue = filtered.reduce((s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0);
    const rawCash = filtered.reduce((s: number, t: any) => s + (t.cash_amount || 0), 0);
    const rawTransfer = filtered.reduce((s: number, t: any) => s + (t.transfer_amount || 0), 0);
    const rawTransactions = filtered.length;

    // Use raw computation first; fall back to analytics if raw is empty
    let totalRevenue = rawRevenue > 0 ? rawRevenue : (revenueSummary?.totalRevenue ?? 0);
    let totalCash = rawCash;
    let totalTransfer = rawTransfer;
    let totalTransactions = rawTransactions > 0 ? rawTransactions : (revenueSummary?.transactionCount ?? 0);

    console.debug('[Laporan Trace]', {
        filter,
        periodStartISO: period.startISO,
        periodEndExclusiveISO: period.endExclusiveISO,
        revenueSummary,
        txListLength: filtered.length,
        txListRevenue: { totalRevenue: rawRevenue, totalCash: rawCash, totalTransfer: rawTransfer, totalTransactions: rawTransactions },
        finalTotalRevenue: totalRevenue,
        finalTotalTransactions: totalTransactions,
    });

    // Get rooms per location — local mirror first (30m cache), Supabase fallback
    const allRooms = await withEgressCache(
        egressCacheKey('nomor_kamar', 'laporan-rooms'),
        CACHE_TTL.DASHBOARD_MONTH,
        async () => {
            if (process.env.ANALYTICS_DATABASE_URL) {
                try {
                    const rows = await queryAnalytics<{ name: string; lokasi: string }>(
                        `SELECT name, lokasi FROM nomor_kamar WHERE is_deleted = FALSE`
                    );
                    if (rows.length > 0) return rows;
                } catch (err) {
                    console.warn('[Laporan] nomor_kamar mirror read failed, using Supabase:', err);
                }
            }
            const { data } = await supabase.from('nomor_kamar').select('name, lokasi');
            return data || [];
        },
    );
    const roomsByLocation: Record<string, string[]> = {};
    allRooms?.forEach((r: any) => {
        if (!roomsByLocation[r.lokasi]) roomsByLocation[r.lokasi] = [];
        roomsByLocation[r.lokasi].push(r.name);
    });

    // Group by location and room — reuse already-filtered transactions
    const groupedTxList = filtered;

    const locMap: Record<string, { transactions: number; revenue: number; rooms: Record<string, { tx: number; rev: number }> }> = {};
    groupedTxList.forEach((t: any) => {
        const loc = t.apartment_location;
        if (!locMap[loc]) locMap[loc] = { transactions: 0, revenue: 0, rooms: {} };
        locMap[loc].transactions++;
        locMap[loc].revenue += (t.cash_amount || 0) + (t.transfer_amount || 0);
        const room = t.room_number;
        if (!locMap[loc].rooms[room]) locMap[loc].rooms[room] = { tx: 0, rev: 0 };
        locMap[loc].rooms[room].tx++;
        locMap[loc].rooms[room].rev += (t.cash_amount || 0) + (t.transfer_amount || 0);
    });

    // Calculate days in period for occupancy
    const startDate = new Date(start);
    const endDate = new Date(end);
    const periodDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));

    const locations: LocationReport[] = Object.entries(roomsByLocation)
        .map(([name, roomList]) => {
            const locData = locMap[name] || { transactions: 0, revenue: 0, rooms: {} };
            const rooms: RoomReport[] = roomList.map(roomNumber => {
                const rd = locData.rooms[roomNumber] || { tx: 0, rev: 0 };
                return {
                    roomNumber,
                    location: name,
                    transactions: rd.tx,
                    revenue: rd.rev,
                    occupancyRate: Math.min(100, Math.round((rd.tx / periodDays) * 100)),
                };
            }).sort((a, b) => b.transactions - a.transactions);

            return {
                name,
                totalRooms: roomList.length,
                transactions: locData.transactions,
                revenue: locData.revenue,
                rooms,
                totalExpenses: 0,
            };
        })
        .sort((a, b) => b.revenue - a.revenue);

    // ── EXPENSES (analytics-first, legacy Supabase fallback) ──
    let expenses: ExpenseReport[] = [];
    let totalExpenses = 0;
    let analyticsExpensesUsed = false;

    // Egress P1 (D-3): ONE pengeluaran period scan feeds both the category
    // summary and the per-location/per-room maps (was two identical fetches).
    // No existing RPC returns per-row room_number/apartment_location, so the
    // three derived shapes (expenses, expensesPerLocation, roomExpensesMap)
    // stay JS-side. Cached per exact date range; RLS output is identical for
    // all authenticated users (service-role client, no per-user filter).
    const expenseRows = await withEgressCache(
        egressCacheKey('pengeluaran', 'laporan-scan', startDateStr, endDateStr),
        laporanTtlFor(start, end),
        async () => {
            const local = await readExpensesLocal(startDateStr, endDateStr, isCurrent);
            if (local) return local;
            const { data } = await supabase
                .from('pengeluaran')
                .select('category, jumlah, apartment_location, room_number')
                .gte('tanggal', startDateStr)
                .lte('tanggal', endDateStr);
            return data || [];
        },
    );

    // hotel_day: skip analytics aggregate to preserve ISO time boundaries.
    // Stale mirror or empty analytics for a current period → fall through to
    // expenseRows (itself mirror-first with Supabase fallback).
    if (mode !== 'hotel_day' && process.env.ANALYTICS_DATABASE_URL) {
        try {
            const freshEnough = !isCurrent || (await isAnalyticsTableFresh('pengeluaran'));
            const expSummary = freshEnough ? await getExpenseSummary(undefined, undefined, period) : null;
            if (expSummary && (expSummary.totalAmount > 0 || expSummary.byCategory.length > 0)) {
                totalExpenses = expSummary.totalAmount;
                expenses = expSummary.byCategory
                    .map(c => ({ category: c.category, total: c.total_amount, count: c.expense_count }))
                    .sort((a, b) => b.total - a.total);
                analyticsExpensesUsed = true;
            }
        } catch (e) {
            console.warn('[laporan] Analytics expenses unavailable, falling back to Supabase:', e);
        }
    }

    // Fallback: compute from Supabase pengeluaran if analytics threw error
    if (!analyticsExpensesUsed) {
        const expMap: Record<string, { total: number; count: number }> = {};
        expenseRows.forEach((e: any) => {
            const cat = e.category || 'Lainnya';
            if (!expMap[cat]) expMap[cat] = { total: 0, count: 0 };
            expMap[cat].total += e.jumlah || 0;
            expMap[cat].count++;
        });

        expenses = Object.entries(expMap)
            .map(([category, d]) => ({ category, total: d.total, count: d.count }))
            .sort((a, b) => b.total - a.total);

        totalExpenses = expenses.reduce((s, e) => s + e.total, 0);
    }

    // expensesPerLocation: keep legacy Supabase (shape mismatch with analytics byLocation)
    const expPerLocation: Record<string, { category: string; total: number; count: number }[]> = {};
    // Room-level expense map + location-level expense totals
    const roomExpensesMap: Record<string, { hasExpenses: boolean; count: number; total: number }> = {};
    const locationTotalExpenses: Record<string, number> = {};
    expenseRows.forEach((e: any) => {
        const cat = e.category || 'Lainnya';
        const loc = e.apartment_location;
        const hasRoom = !!(e.room_number);
        if (loc && !hasRoom) {
            if (!expPerLocation[loc]) expPerLocation[loc] = [];
            const existing = expPerLocation[loc].find(x => x.category === cat);
            if (existing) { existing.total += e.jumlah || 0; existing.count++; }
            else expPerLocation[loc].push({ category: cat, total: e.jumlah || 0, count: 1 });
        }
        // Build room-level expense map
        if (e.room_number && e.apartment_location) {
            const key = `${e.apartment_location}|${e.room_number}`;
            if (!roomExpensesMap[key]) roomExpensesMap[key] = { hasExpenses: false, count: 0, total: 0 };
            roomExpensesMap[key].hasExpenses = true;
            roomExpensesMap[key].count++;
            roomExpensesMap[key].total += e.jumlah || 0;
        }
        // Build location-level expense total
        if (loc) {
            locationTotalExpenses[loc] = (locationTotalExpenses[loc] || 0) + (e.jumlah || 0);
        }
    });

    // Merge location total expenses into location reports
    const locationsWithExpenses = locations.map(loc => ({
        ...loc,
        totalExpenses: locationTotalExpenses[loc.name] || 0,
    }));

    // ── TAGIHAN BULANAN (analytics-first for month-aligned, legacy Supabase fallback) ──
    let tagihan: TagihanReport = {
        paid: 0,
        unpaid: 0,
        paidCount: 0,
        unpaidCount: 0,
    };

    // Check if date range is month-aligned
    const startDateObj = parseISO(start.split('T')[0]);
    const endDateObj = parseISO(end.split('T')[0]);
    const isMonthAlignedRange = isMonthAligned(startDateObj, endDateObj);

    // hotel_day: skip analytics monthly summaries (calendar-month aggregation breaks ISO time boundaries)
    if (isMonthAlignedRange && mode !== 'hotel_day' && process.env.ANALYTICS_DATABASE_URL) {
        try {
            // Extract year/month range
            const startYear = startDateObj.getFullYear();
            const startMonth = startDateObj.getMonth() + 1; // 1-based
            const endYear = endDateObj.getFullYear();
            const endMonth = endDateObj.getMonth() + 1; // 1-based

            const monthlySummaries = await getMonthlySummaries(startYear, startMonth, endYear, endMonth);

            // Aggregate across all locations and months
            for (const summary of monthlySummaries) {
                tagihan.paid += summary.paid_bills_amount;
                tagihan.unpaid += summary.unpaid_bills_amount;
                tagihan.paidCount += summary.paid_bills_count;
                tagihan.unpaidCount += summary.unpaid_bills_count;
            }
        } catch (e) {
            console.warn('[laporan] Analytics bills unavailable, falling back to Supabase:', e);
            // Fall through to legacy path (consolidated + cached, no date bound)
            tagihan = await fetchTagihanReport(supabase);
        }
    } else {
        // Legacy Supabase path for non-month-aligned ranges (consolidated + cached)
        tagihan = await fetchTagihanReport(supabase);
    }

    // ── FEE MARKETING (analytics-first for month-aligned, legacy Supabase fallback) ──
    let feeMarketing: FeeMarketingReport = {
        totalPaid: 0,
        totalUnpaid: 0,
        paidCount: 0,
        unpaidCount: 0,
    };

    // hotel_day: skip analytics monthly summaries (calendar-month aggregation breaks ISO time boundaries)
    if (isMonthAlignedRange && mode !== 'hotel_day' && process.env.ANALYTICS_DATABASE_URL) {
        try {
            // Extract year/month range
            const startYear = startDateObj.getFullYear();
            const startMonth = startDateObj.getMonth() + 1; // 1-based
            const endYear = endDateObj.getFullYear();
            const endMonth = endDateObj.getMonth() + 1; // 1-based

            const monthlySummaries = await getMonthlySummaries(startYear, startMonth, endYear, endMonth);

            // Aggregate across all locations and months
            let totalFees = 0;
            let paidFees = 0;
            for (const summary of monthlySummaries) {
                totalFees += summary.total_marketing_fees;
                paidFees += summary.paid_fees_amount;
            }

            feeMarketing = {
                totalPaid: paidFees,
                totalUnpaid: Math.max(0, totalFees - paidFees),
                paidCount: 0, // Monthly summary doesn't track paid fee count
                unpaidCount: 0,
            };
        } catch (e) {
            console.warn('[laporan] Analytics marketing fees unavailable, falling back to Supabase:', e);
            // Fall through to legacy path (consolidated + cached, no date bound)
            const { totalPaid, paidCount } = await fetchFeePaidAggregate(supabase);
            const totalFeeAll = txList.reduce((s, t: any) => s + (t.marketing_fee || 0), 0);

            feeMarketing = {
                totalPaid,
                totalUnpaid: Math.max(0, totalFeeAll - totalPaid),
                paidCount,
                unpaidCount: 0,
            };
        }
    } else {
        // Legacy Supabase path for non-month-aligned ranges (consolidated + cached)
        const { totalPaid, paidCount } = await fetchFeePaidAggregate(supabase);
        const totalFeeAll = txList.reduce((s, t: any) => s + (t.marketing_fee || 0), 0);

        feeMarketing = {
            totalPaid,
            totalUnpaid: Math.max(0, totalFeeAll - totalPaid),
            paidCount,
            unpaidCount: 0,
        };
    }

    // ── COMPARISON (computed from Supabase) ──
    // Use unified comparison range if provided, else fall back to legacy
    let prevRange: { start: string; end: string; label: string };

    if (dateParams?.comparisonMode && dateParams.comparisonMode !== 'none') {
        const cr = computeComparisonRange(
            dateParams.comparisonMode,
            start,
            end,
            dateParams.comparisonStartDate,
            dateParams.comparisonEndDate,
            mode,
        );
        prevRange = cr || { start, end, label: 'Periode sama' };
    } else {
        prevRange = getPreviousDateRange(filter, mode);
    }

    const prevPeriod = buildPeriodFromISO(prevRange.start, prevRange.end);
    let prevRevenue = 0, prevTransactions = 0, prevExpenses = 0;

    // Compute comparison — mirror-first with exclusive-end COALESCE filter,
    // Supabase fallback (same narrow columns as before).
    {
        const prevIsCurrent = prevPeriod.endExclusiveDate > todayWIB;
        const [prevTxData, prevExpData] = await Promise.all([
            readTransactionsLocal(prevPeriod, prevIsCurrent).then(async (rows) => {
                if (rows) return rows;
                const { data } = await supabase
                    .from('transactions')
                    .select('cash_amount, transfer_amount, checkin_at, created_at')
                    .or(`checkin_at.gte.${prevRange.start},and(checkin_at.is.null,created_at.gte.${prevRange.start})`);
                return data || [];
            }),
            readExpensesLocal(prevPeriod.startDate, prevPeriod.endDate, prevIsCurrent).then(async (rows) => {
                if (rows) return rows;
                const { data } = await supabase
                    .from('pengeluaran')
                    .select('jumlah')
                    .gte('tanggal', prevPeriod.startDate)
                    .lte('tanggal', prevPeriod.endDate);
                return data || [];
            }),
        ]);

        const prevFiltered = (prevTxData as any[]).filter((t: any) => {
            const effDate = t.checkin_at ?? t.created_at;
            if (!effDate) return false;
            const eff = new Date(effDate).getTime();
            const s = new Date(prevPeriod.startISO).getTime();
            const e = new Date(prevPeriod.endExclusiveISO).getTime();
            return eff >= s && eff < e;
        });
        prevRevenue = prevFiltered.reduce((s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0) || 0;
        prevTransactions = prevFiltered.length;
        prevExpenses = (prevExpData as any[]).reduce((s, e: any) => s + (e.jumlah || 0), 0) || 0;
    }

    const comparison: LaporanData['comparison'] = {
        prevRevenue,
        prevTransactions,
        prevExpenses,
        prevLabel: prevRange.label,
    };

    return {
        filter,
        filterLabel: label,
        totalRevenue,
        totalTransactions,
        totalCash,
        totalTransfer,
        locations: locationsWithExpenses,
        expenses,
        totalExpenses,
        expensesPerLocation: expPerLocation,
        roomExpensesMap,
        tagihan,
        feeMarketing,
        comparison,
    };
}

export async function fetchRoomDetails(location: string, roomNumber: string, filter: DateFilter = 'today'): Promise<RoomDetail[]> {
    const supabase = createServerClient();
    const { start, end } = getDateRange(filter);

    const { data } = await supabase
        .from('transactions')
        .select('id, customer_name, checkin_at, checkout_at, rental_duration, cash_amount, transfer_amount, transfer_to, marketing_name, marketing_fee, input_by, shift')
        .eq('apartment_location', location)
        .eq('room_number', roomNumber)
        .lte('checkin_at', end)
        .or(`checkout_at.is.null,checkout_at.gte.${start}`)
        .order('checkin_at', { ascending: false });

    return (data || []).map((t: any) => ({
        id: t.id,
        customerName: t.customer_name,
        checkinAt: t.checkin_at,
        checkoutAt: t.checkout_at,
        rentalDuration: t.rental_duration,
        cashAmount: t.cash_amount || 0,
        transferAmount: t.transfer_amount || 0,
        transferTo: t.transfer_to,
        marketingName: t.marketing_name,
        marketingFee: t.marketing_fee || 0,
        inputBy: t.input_by,
        shift: t.shift,
    }));
}

/**
 * Fetch expenses for a specific room/unit in the given date filter range.
 * Used to show per-unit expenses inside the room detail modal.
 */
export async function fetchRoomExpenses(location: string, roomNumber: string, filter: DateFilter = 'today'): Promise<ExpenseDetail[]> {
    const supabase = createServerClient();
    const { start, end } = getDateRange(filter);

    const { data } = await supabase
        .from('pengeluaran')
        .select('id, nama_pengeluaran, jumlah, tanggal, keterangan, apartment_location, room_number, category')
        .eq('apartment_location', location)
        .eq('room_number', roomNumber)
        .gte('tanggal', start.split('T')[0])
        .lte('tanggal', end.split('T')[0])
        .order('tanggal', { ascending: false })
        .order('id', { ascending: false });

    return (data || []).map((e: any) => ({
        id: e.id,
        namaPengeluaran: e.nama_pengeluaran,
        jumlah: e.jumlah || 0,
        tanggal: e.tanggal,
        keterangan: e.keterangan,
        apartmentLocation: e.apartment_location,
        roomNumber: e.room_number,
        category: e.category,
    }));
}

/** Detect LOCATIONS where overall occupancy is ≥90% (all units combined) */
import { getRoomDayUtilization } from '@/lib/services/occupancy';

export async function fetchHighOccupancyLocations(days: number = 30) {
    const endDate = format(new Date(), 'yyyy-MM-dd');
    const startDate = format(subDays(new Date(), days - 1), 'yyyy-MM-dd');
    const results = await getRoomDayUtilization(startDate, endDate);
    return results;
}


// =====================================================
// Expense detail per category (paginated + sortable)
// =====================================================

export interface ExpenseDetail {
    id: number;
    namaPengeluaran: string;
    jumlah: number;
    tanggal: string;
    keterangan: string | null;
    apartmentLocation: string | null;
    roomNumber: string | null;
    category: string | null;
}

export type ExpenseSortKey = 'tanggal' | 'jumlah' | 'nama_pengeluaran' | 'apartment_location';
export type SortDirection = 'asc' | 'desc';

export interface ExpenseDetailsResponse {
    rows: ExpenseDetail[];
    total: number;
    page: number;
    pageSize: number;
    category: string;
}

/**
 * Fetch expense rows for a given category in the current laporan filter range.
 * Server-side pagination + sorting.
 */
export async function fetchExpenseDetailsByCategory(
    category: string,
    filter: DateFilter = 'today',
    page: number = 1,
    pageSize: number = 10,
    sortKey: ExpenseSortKey = 'tanggal',
    sortDir: SortDirection = 'desc',
): Promise<ExpenseDetailsResponse> {
    const supabase = createServerClient();
    const { start, end } = getDateRange(filter);

    const safePage = Math.max(1, page);
    const safeSize = Math.max(1, Math.min(100, pageSize));
    const from = (safePage - 1) * safeSize;
    const to = from + safeSize - 1;

    let query = supabase
        .from('pengeluaran')
        .select('id, nama_pengeluaran, jumlah, tanggal, keterangan, apartment_location, room_number, category', { count: 'exact' })
        .gte('tanggal', start.split('T')[0])
        .lte('tanggal', end.split('T')[0]);

    // Filter category — null/empty/whitespace becomes "Lainnya"
    if (category === 'Lainnya') {
        query = query.or('category.is.null,category.eq.');
    } else {
        query = query.eq('category', category);
    }

    query = query.order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
        console.error('Error fetching expense details:', error);
        return { rows: [], total: 0, page: safePage, pageSize: safeSize, category };
    }

    return {
        rows: (data || []).map((e: any) => ({
            id: e.id,
            namaPengeluaran: e.nama_pengeluaran,
            jumlah: e.jumlah || 0,
            tanggal: e.tanggal,
            keterangan: e.keterangan,
            apartmentLocation: e.apartment_location,
            roomNumber: e.room_number,
            category: e.category,
        })),
        total: count || 0,
        page: safePage,
        pageSize: safeSize,
        category,
    };
}

/**
 * Fetch all expenses for export (no pagination)
 */
export async function fetchAllExpenses(filter: DateFilter) {
    const supabase = createServerClient();
    const { start, end } = getDateRange(filter);

    try {
        let query = supabase
            .from('pengeluaran')
            .select('id, nama_pengeluaran, jumlah, tanggal, keterangan, apartment_location, room_number, category')
            .gte('tanggal', start.split('T')[0])
            .lte('tanggal', end.split('T')[0])
            .order('tanggal', { ascending: false });

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching expenses for export:', error);
            return [];
        }

        return (data || []).map((e: any) => ({
            tanggal: e.tanggal || '',
            category: e.category || 'Lainnya',
            namaPengeluaran: e.nama_pengeluaran || '',
            jumlah: e.jumlah || 0,
            apartmentLocation: e.apartment_location || '',
            roomNumber: e.room_number || '',
            keterangan: e.keterangan || '',
        }));
    } catch (error) {
        console.error('Error in fetchAllExpenses:', error);
        return [];
    }
}
