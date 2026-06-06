import { createServerClient } from '@/lib/supabase/server';
import {
    getDailyRevenue as getDailyRevenueAnalytics,
    getRevenueSummary as getRevenueSummaryAnalytics,
} from '@/lib/analytics/revenue';
import { effectiveDate } from '@/lib/dashboard/transaction-source';
import { format, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { ReportPeriodRange } from '@/lib/shared/report-period';

// ============================================================
// lib/services/revenue.ts
//
// Revenue-related service functions extracted from:
//   - dashboard/actions.ts  → fetchRevenueData() (RPC call)
//   - booking/actions.ts    → inline revenue aggregation
//
// Migration Phase 2B-5A:
//   Analytics DB first, Supabase fallback.
//   Old implementation kept for fallback.
// ============================================================

export interface RevenueSummary {
    totalRevenue: number;
    cashAmount: number;
    transferAmount: number;
    transactionCount: number;
}

export interface RevenueTrendPoint {
    date: string;
    revenue: number;
    transactionCount: number;
}

// ─── Helpers ────────────────────────────────────────────────

/** Check if analytics DB is configured. */
function analyticsConfigured(): boolean {
    return !!process.env.ANALYTICS_DATABASE_URL;
}

/**
 * Check whether a period represents a full calendar-day range.
 * The analytics DB uses date_wib (calendar day) aggregation, so it is only
 * safe to query when the period covers whole calendar days from 00:00:00
 * to 23:59:59.  Hotel-day periods (e.g. 12:00–11:59 next day) and partial
 * days would overcount/undercount against the analytics DB.
 */
function isFullCalendarDayPeriod(period: ReportPeriodRange): boolean {
    return (
        period.mode === 'calendar_day' &&
        period.startISO.includes('T00:00:00') &&
        period.endISO.includes('T23:59:59')
    );
}

/**
 * Transform analytics RevenueByDateRange → legacy RevenueSummary.
 * Analytics returns totalCash/totalTransfer instead of cashAmount/transferAmount.
 */
function toRevenueSummary(a: {
    totalRevenue: number;
    totalCash: number;
    totalTransfer: number;
    totalTransactions: number;
}): RevenueSummary {
    return {
        totalRevenue: a.totalRevenue,
        cashAmount: a.totalCash,
        transferAmount: a.totalTransfer,
        transactionCount: a.totalTransactions,
    };
}

/**
 * Normalize a date_wib value (Date object or string) to YYYY-MM-DD string.
 * pg returns DATE columns as JavaScript Date objects.
 */
function normalizeDate(d: unknown): string {
    if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    if (typeof d === 'string') return d;
    return String(d);
}

// ============================================================
// getRevenueSummary(start, end)
//
// Aggregate revenue = SUM(cash_amount + transfer_amount) for a
// given period.
// ============================================================
export async function getRevenueSummary(period: ReportPeriodRange): Promise<RevenueSummary> {
    // Use date strings (YYYY-MM-DD) for analytics query
    const startStr = period.startDate;
    // Exclusive end: analytics uses date_wib >= start AND date_wib < endExclusive
    // where endExclusive should be the day AFTER period.end
    const endDateObj = new Date(period.endISO);
    const endExclusive = format(addDays(endDateObj, 1), 'yyyy-MM-dd');

    // ── Analytics path (primary) ──────────────────────────────
    if (analyticsConfigured() && isFullCalendarDayPeriod(period)) {
        try {
            const data = await getRevenueSummaryAnalytics(startStr, endExclusive);
            console.debug('[revenue] analytics summary:', { startStr, endExclusive, data });
            return toRevenueSummary(data);
        } catch (error) {
            console.warn('[revenue] Analytics DB unavailable, falling back to Supabase:', error);
        }
    }

    // ── Supabase fallback ────────────────────────────────────
    return getRevenueSummaryLegacy(period);
}

/**
 * Supabase-only fallback.
 * Uses COALESCE(checkin_at, created_at) via .or() filter + JS filtering
 * to match canonical effective-date logic. Excludes nominal field.
 */
async function getRevenueSummaryLegacy(period: ReportPeriodRange): Promise<RevenueSummary> {
    const supabase = createServerClient();

    try {
        // Widen Supabase filter: checkin_at >= period.startISO OR (checkin_at IS NULL AND created_at >= period.startISO)
        // JS filter then applies exclusive-end and COALESCE logic
        const { data, error } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount, checkin_at, created_at')
            .or(
                `and(checkin_at.gte.${period.startISO},checkin_at.lt.${period.endISO}),` +
                `and(checkin_at.is.null,created_at.gte.${period.startISO},created_at.lt.${period.endISO})`
            );

        if (error) {
            console.error('Error fetching revenue summary:', error);
            return {
                totalRevenue: 0,
                cashAmount: 0,
                transferAmount: 0,
                transactionCount: 0,
            };
        }

        let cashAmount = 0;
        let transferAmount = 0;
        let count = 0;

        for (const t of data || []) {
            const effDate = effectiveDate(t);
            // Apply exclusive-end filter: period.startISO <= effectiveDate < period.endISO
            if (effDate && effDate >= period.startISO && effDate < period.endISO) {
                cashAmount += t.cash_amount ?? 0;
                transferAmount += t.transfer_amount ?? 0;
                count++;
            }
        }

        return {
            totalRevenue: cashAmount + transferAmount,
            cashAmount,
            transferAmount,
            transactionCount: count,
        };
    } catch (error) {
        console.error('Error in getRevenueSummary:', error);
        return {
            totalRevenue: 0,
            cashAmount: 0,
            transferAmount: 0,
            transactionCount: 0,
        };
    }
}

// ============================================================
// getRevenueTrend(period, location?)
//
// Get revenue trend using the get_daily_revenue_trend RPC.
// Falls back gracefully if RPC fails.
//
// Mirrors fetchRevenueData() in dashboard/actions.ts:466-514
// ============================================================
export async function getRevenueTrend(
    period: ReportPeriodRange,
    location?: string | null
): Promise<RevenueTrendPoint[]> {
    const startStr = period.startDate;
    const endDateObj = new Date(period.endISO);
    const endExclusive = format(addDays(endDateObj, 1), 'yyyy-MM-dd');

    // ── Analytics path (primary) ──────────────────────────────
    if (analyticsConfigured() && isFullCalendarDayPeriod(period)) {
        try {
            const dailyRows = await getDailyRevenueAnalytics(startStr, endExclusive);

            // Aggregate per date (analytics returns per-location rows)
            const byDate = new Map<string, { revenue: number; count: number }>();

            for (const row of dailyRows) {
                // Apply location filter if specified
                if (location && row.apartment_location !== location) continue;

                const dateKey = normalizeDate(row.date_wib);
                const existing = byDate.get(dateKey) || { revenue: 0, count: 0 };
                existing.revenue += row.total_revenue;
                existing.count += row.transaction_count;
                byDate.set(dateKey, existing);
            }

            return Array.from(byDate.entries())
                .map(([date, { revenue, count }]) => ({
                    date,
                    revenue,
                    transactionCount: count,
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
        } catch (error) {
            console.warn('[revenue] Analytics DB unavailable, falling back to Supabase:', error);
        }
    }

    // ── Supabase fallback ────────────────────────────────────
    return getRevenueTrendLegacy(startStr, endExclusive, location);
}

/** Supabase-only fallback (unchanged from original). */
async function getRevenueTrendLegacy(
    startDate: string,
    endDate: string,
    location?: string | null
): Promise<RevenueTrendPoint[]> {
    const supabase = createServerClient();

    try {
        const { data, error } = await supabase.rpc('get_daily_revenue_trend', {
            p_start_date: startDate,
            p_end_date: endDate,
            p_location: location ?? null,
            p_limit: 1000,
            p_offset: 0,
        });

        if (error) {
            console.error('Error fetching revenue trend:', error);
            return [];
        }

        if (!data) {
            return [];
        }

        const result: RevenueTrendPoint[] = (data as any[]).map((row: any) => {
            const rawDate = row.date || row.day || row.transaction_date;
            let dateStr = '';
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    dateStr = format(toZonedTime(d, 'Asia/Jakarta'), 'yyyy-MM-dd');
                }
            }
            if (!dateStr) {
                dateStr = format(toZonedTime(new Date(), 'Asia/Jakarta'), 'yyyy-MM-dd');
            }
            return {
                date: dateStr,
                revenue: Number(row.revenue || row.total_revenue || 0),
                transactionCount: Number(row.transaction_count || row.count || 0),
            };
        });

        return result;
    } catch (error) {
        console.error('Error in getRevenueTrend:', error);
        return [];
    }
}
