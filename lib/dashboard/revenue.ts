// ============================================================
// lib/dashboard/revenue.ts
// Dashboard revenue aggregation layer.
//
// Returns revenue + expense summary. Trend only includes revenue
// (no expense series) per requirement: chart shows Pendapatan only.
// Uses lib/services/* as data backends.
// ============================================================

import {
    getRevenueSummary as getServiceRevenueSummary,
    getRevenueTrend,
} from '@/lib/services/revenue';
import { getExpenseSummary as getServiceExpenseSummary } from '@/lib/services/expense';

// ─── Public API ─────────────────────────────────────────────

export interface RevenueTrendPoint {
    date: string;
    revenue: number;
}

export interface RevenueSummaryResult {
    revenue: number;
    expense: number;
    net: number;
    trend: RevenueTrendPoint[];
}

/**
 * Fetch revenue + expense summary with daily revenue trend.
 *
 * Revenue comes from lib/services/revenue (analytics-first),
 * expenses from lib/services/expense (analytics-first).
 * Trend contains revenue only — chart shows Pendapatan only.
 *
 * @param params.startDate  Period start
 * @param params.endDate    Period end
 * @param params.location   Optional location filter (applied to revenue only;
 *                          expense service does not support location filter)
 */
export async function getRevenueSummary(params: {
    startDate: Date;
    endDate: Date;
    location?: string;
}): Promise<RevenueSummaryResult> {
    const startStr = params.startDate.toISOString().split('T')[0];
    const endStr = params.endDate.toISOString().split('T')[0];

    // ── Fetch all data sources in parallel ───────────────────
    const [revenueSummary, expenseSummary, revenueTrend] = await Promise.all([
        getServiceRevenueSummary(startStr, endStr),
        getServiceExpenseSummary(startStr, endStr),
        getRevenueTrend(startStr, endStr, params.location ?? null),
    ]);

    const trend: RevenueTrendPoint[] = revenueTrend
        .map((r) => ({ date: r.date, revenue: r.revenue }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const revenue = revenueSummary.totalRevenue;
    const expense = expenseSummary.totalAmount;

    return {
        revenue,
        expense,
        net: revenue - expense,
        trend,
    };
}
