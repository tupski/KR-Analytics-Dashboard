// ============================================================
// lib/dashboard/revenue.ts
// Dashboard revenue aggregation layer.
//
// Returns revenue + expense summary. Trend only includes revenue
// (no expense series) per requirement: chart shows Pendapatan only.
// Uses lib/services/* as data backends.
// ============================================================

import type { ReportPeriodRange } from '@/lib/shared/report-period';
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
 * @param params.period    Report period range from shared helper
 * @param params.location  Optional location filter (applied to revenue only;
 *                         expense service does not support location filter)
 */
export async function getRevenueSummary(params: {
    period: ReportPeriodRange;
    location?: string;
}): Promise<RevenueSummaryResult> {
    // ── Fetch all data sources in parallel ───────────────────
    const [revenueSummary, expenseSummary, revenueTrend] = await Promise.all([
        getServiceRevenueSummary(params.period),
        getServiceExpenseSummary(params.period.startDate, params.period.endDate),
        getRevenueTrend(params.period, params.location ?? null),
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
