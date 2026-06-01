// ============================================================
// lib/dashboard/revenue.ts
// Dashboard revenue aggregation layer.
//
// Aggregates revenue + expense data into a single summary with
// daily trend. Combines revenue and expense trends by date.
// Uses lib/services/* as data backends.
// ============================================================

import {
    getRevenueSummary as getServiceRevenueSummary,
    getRevenueTrend,
} from '@/lib/services/revenue';
import {
    getExpenseSummary as getServiceExpenseSummary,
    getExpenseTrend,
} from '@/lib/services/expense';

// ─── Public API ─────────────────────────────────────────────

export interface RevenueTrendPoint {
    date: string;
    revenue: number;
    expense: number;
}

export interface RevenueSummaryResult {
    revenue: number;
    expense: number;
    net: number;
    trend: RevenueTrendPoint[];
}

/**
 * Fetch revenue + expense summary with daily trend.
 *
 * Revenue comes from lib/services/revenue (analytics-first),
 * expenses from lib/services/expense (analytics-first).
 * Trends are merged by date into a single array.
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
    const [revenueSummary, expenseSummary, revenueTrend, expenseTrend] = await Promise.all([
        getServiceRevenueSummary(startStr, endStr),
        getServiceExpenseSummary(startStr, endStr),
        getRevenueTrend(startStr, endStr, params.location ?? null),
        getExpenseTrend(startStr, endStr),
    ]);

    // ── Merge revenue + expense trends by date ───────────────
    const expenseByDate = new Map<string, number>();
    for (const e of expenseTrend) {
        expenseByDate.set(e.date, e.total_amount);
    }

    const trendMap = new Map<string, { revenue: number; expense: number }>();

    for (const r of revenueTrend) {
        trendMap.set(r.date, {
            revenue: r.revenue,
            expense: expenseByDate.get(r.date) || 0,
        });
    }

    // Add expense-only dates (revenue trend may have gaps)
    for (const e of expenseTrend) {
        if (!trendMap.has(e.date)) {
            trendMap.set(e.date, { revenue: 0, expense: e.total_amount });
        }
    }

    const trend: RevenueTrendPoint[] = Array.from(trendMap.entries())
        .map(([date, values]) => ({ date, ...values }))
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
