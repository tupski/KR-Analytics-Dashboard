import { queryAnalytics, parseNumeric } from './db';
import type { DailyRevenue, RevenueByDateRange } from './types';
import { toZonedTime } from 'date-fns-tz';

/**
 * Return a default 30-day range ending today (WIB).
 * endDate is exclusive (next day after range end).
 */
function getDefaultDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const wib = toZonedTime(now, 'Asia/Jakarta');
    const end = new Date(wib);
    end.setDate(end.getDate() + 1);
    const start = new Date(wib);
    start.setDate(start.getDate() - 30);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

function nextDay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00+07:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function resolveRange(
    startDate?: string,
    endDate?: string
): { startDate: string; endDate: string } {
    if (startDate) {
        return { startDate, endDate: endDate ?? nextDay(startDate) };
    }
    return getDefaultDateRange();
}

/**
 * Fetch raw daily revenue rows within a date range.
 * Defaults to last 30 days (WIB).
 */
export async function getDailyRevenue(
    startDate?: string,
    endDate?: string
): Promise<DailyRevenue[]> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
    const rows = await queryAnalytics<DailyRevenue>(
        `SELECT *
     FROM analytics_daily_revenue
     WHERE date_wib >= $1 AND date_wib < $2
     ORDER BY date_wib, apartment_location`,
        [sd, ed]
    );
    return rows.map(r => ({
        ...r,
        total_revenue: parseNumeric(r.total_revenue),
        cash_revenue: parseNumeric(r.cash_revenue),
        transfer_revenue: parseNumeric(r.transfer_revenue),
        transaction_count: parseNumeric(r.transaction_count),
        avg_revenue_per_tx: parseNumeric(r.avg_revenue_per_tx),
        unique_rooms: parseNumeric(r.unique_rooms),
    }));
}

/**
 * Get aggregated revenue summary for a date range.
 * Returns totals, averages, per-day/per-transaction metrics.
 *
 * NOTE: This queries analytics_daily_revenue which uses COALESCE(checkin_at, created_at)
 * in the sync worker. Today's data may be delayed ~1-2 min behind sync.
 * Callers should fall back to raw transactions for today if needed.
 */
export async function getRevenueSummary(
    startDate?: string,
    endDate?: string
): Promise<RevenueByDateRange> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
    const rows = await queryAnalytics<{
        total_revenue: string;
        total_cash: string;
        total_transfer: string;
        total_transactions: string;
        day_count: string;
    }>(
        `SELECT
       COALESCE(SUM(total_revenue), 0)      AS total_revenue,
       COALESCE(SUM(cash_revenue), 0)       AS total_cash,
       COALESCE(SUM(transfer_revenue), 0)   AS total_transfer,
       COALESCE(SUM(transaction_count), 0)  AS total_transactions,
       COUNT(DISTINCT date_wib)             AS day_count
     FROM analytics_daily_revenue
     WHERE date_wib >= $1 AND date_wib < $2`,
        [sd, ed]
    );
    const row = rows[0];
    const totalRevenue = parseNumeric(row.total_revenue);
    const totalTransactions = parseNumeric(row.total_transactions);
    const dayCount = parseNumeric(row.day_count) || 1;
    return {
        startDate: sd,
        endDate: ed,
        totalRevenue,
        totalCash: parseNumeric(row.total_cash),
        totalTransfer: parseNumeric(row.total_transfer),
        totalTransactions,
        averagePerDay: Math.round(totalRevenue / dayCount),
        averagePerTransaction:
            totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0,
    };
}

/**
 * Get revenue breakdown by apartment location for a date range.
 */
export async function getRevenueByLocation(
    startDate?: string,
    endDate?: string
): Promise<
    Array<{ apartment_location: string; total_revenue: number; transaction_count: number }>
> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
    const rows = await queryAnalytics<{
        apartment_location: string;
        total_revenue: number;
        transaction_count: number;
    }>(
        `SELECT
       apartment_location,
       SUM(total_revenue)     AS total_revenue,
       SUM(transaction_count) AS transaction_count
     FROM analytics_daily_revenue
     WHERE date_wib >= $1 AND date_wib < $2
     GROUP BY apartment_location
     ORDER BY total_revenue DESC`,
        [sd, ed]
    );
    return rows.map(r => ({
        apartment_location: r.apartment_location,
        total_revenue: parseNumeric(r.total_revenue),
        transaction_count: parseNumeric(r.transaction_count),
    }));
}
