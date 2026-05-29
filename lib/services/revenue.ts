import { createServerClient } from '@/lib/supabase/server';
import {
    getDailyRevenue as getDailyRevenueAnalytics,
    getRevenueSummary as getRevenueSummaryAnalytics,
} from '@/lib/analytics/revenue';

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
export async function getRevenueSummary(start: string, end: string): Promise<RevenueSummary> {
    // ── Analytics path (primary) ──────────────────────────────
    if (analyticsConfigured()) {
        try {
            const data = await getRevenueSummaryAnalytics(start, end);
            return toRevenueSummary(data);
        } catch (error) {
            console.warn('[revenue] Analytics DB unavailable, falling back to Supabase:', error);
        }
    }

    // ── Supabase fallback ────────────────────────────────────
    return getRevenueSummaryLegacy(start, end);
}

/** Supabase-only fallback (unchanged from original). */
async function getRevenueSummaryLegacy(start: string, end: string): Promise<RevenueSummary> {
    const supabase = createServerClient();

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', start)
            .lte('checkin_at', end);

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

        (data || []).forEach((t: any) => {
            cashAmount += t.cash_amount || 0;
            transferAmount += t.transfer_amount || 0;
        });

        const totalRevenue = cashAmount + transferAmount;
        const transactionCount = (data || []).length;

        return {
            totalRevenue,
            cashAmount,
            transferAmount,
            transactionCount,
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
// getRevenueTrend(startDate, endDate, location?)
//
// Get revenue trend using the get_daily_revenue_trend RPC.
// Falls back gracefully if RPC fails.
//
// Mirrors fetchRevenueData() in dashboard/actions.ts:466-514
// ============================================================
export async function getRevenueTrend(
    startDate: string,
    endDate: string,
    location?: string | null
): Promise<RevenueTrendPoint[]> {
    // ── Analytics path (primary) ──────────────────────────────
    if (analyticsConfigured()) {
        try {
            const dailyRows = await getDailyRevenueAnalytics(startDate, endDate);

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
    return getRevenueTrendLegacy(startDate, endDate, location);
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
                    dateStr = d.toISOString().split('T')[0];
                }
            }
            if (!dateStr) {
                dateStr = new Date().toISOString().split('T')[0];
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
