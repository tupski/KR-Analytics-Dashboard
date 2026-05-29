import {
    getExpenses as getExpensesAnalytics,
    getExpenseSummary as getExpenseSummaryAnalytics,
} from '@/lib/analytics/expenses';
import type { ExpenseByDateRange } from '@/lib/analytics/types';

// ============================================================
// lib/services/expense.ts
//
// Expense/pengeluaran service layer.
// Reads from local analytics DB via lib/analytics/expenses.ts.
// No legacy Supabase fallback — uses safe empty defaults.
//
// Migration Phase 2B-5C:
//   Analytics DB first, safe empty fallback.
//   Old implementations remain in laporan/actions.ts.
// ============================================================

// ─── Types ─────────────────────────────────────────────

export interface ExpenseSummary {
    totalAmount: number;
    totalExpenses: number;
    startDate: string;
    endDate: string;
    byCategory: Array<{ category: string; total_amount: number; expense_count: number }>;
    byLocation: Array<{ apartment_location: string; total_amount: number; expense_count: number }>;
}

export interface ExpenseTrendPoint {
    date: string;        // 'YYYY-MM-DD' or 'YYYY-MM' depending on groupBy
    total_amount: number;
    expense_count: number;
}

export interface CategoryBreakdown {
    category: string;
    total_amount: number;
    expense_count: number;
    percentage: number;  // % of total expenses
}

// ─── Helpers ───────────────────────────────────────────

/** Check if analytics DB is configured. */
function analyticsConfigured(): boolean {
    return !!process.env.ANALYTICS_DATABASE_URL;
}

/** Get a default 30-day date range in WIB (Asia/Jakarta). */
function getDefaultDateRange(days = 30): { startDate: string; endDate: string } {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const end = new Date(wib);
    end.setDate(end.getDate() + 1);
    const start = new Date(wib);
    start.setDate(start.getDate() - days);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

/** Normalize date_wib: pg returns DATE columns as Date objects; cast to YYYY-MM-DD string. */
function normalizeExpenseDate(d: unknown): string {
    if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    if (typeof d === 'string') return d.split('T')[0];
    return String(d);
}

/** Resolve start/end with defaults, ensuring endDate is set. */
function resolveRange(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
    if (startDate) {
        return {
            startDate,
            endDate: endDate ?? new Date().toISOString().split('T')[0],
        };
    }
    return getDefaultDateRange();
}

// ─── Functions ─────────────────────────────────────────

/**
 * Aggregate expense summary for a date range.
 * Defaults to last 30 days (WIB).
 *
 * Analytics-first → safe empty fallback.
 */
export async function getExpenseSummary(
    startDate?: string,
    endDate?: string
): Promise<ExpenseSummary> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);

    if (analyticsConfigured()) {
        try {
            const data: ExpenseByDateRange = await getExpenseSummaryAnalytics(sd, ed);
            return {
                totalAmount: data.totalAmount,
                totalExpenses: data.totalExpenses,
                startDate: sd,
                endDate: ed,
                byCategory: data.byCategory.map(c => ({
                    category: c.category,
                    total_amount: c.total_amount,
                    expense_count: c.expense_count,
                })),
                byLocation: data.byLocation.map(l => ({
                    apartment_location: l.apartment_location,
                    total_amount: l.total_amount,
                    expense_count: l.expense_count,
                })),
            };
        } catch (error) {
            console.warn('[expense] Analytics DB unavailable, falling back to safe empty:', error);
        }
    }

    // Safe empty fallback
    return {
        totalAmount: 0,
        totalExpenses: 0,
        startDate: sd,
        endDate: ed,
        byCategory: [],
        byLocation: [],
    };
}

/**
 * Get expenses grouped by category with percentage breakdown.
 * Defaults to last 30 days (WIB).
 */
export async function getExpensesByCategory(
    startDate?: string,
    endDate?: string
): Promise<CategoryBreakdown[]> {
    const summary = await getExpenseSummary(startDate, endDate);
    const total = summary.totalAmount;

    return summary.byCategory
        .map(c => ({
            category: c.category,
            total_amount: c.total_amount,
            expense_count: c.expense_count,
            percentage: total > 0 ? Math.round((c.total_amount / total) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.total_amount - a.total_amount);
}

/**
 * Get expenses grouped by location, sorted by total descending.
 * Defaults to last 30 days (WIB).
 */
export async function getExpensesByLocation(
    startDate?: string,
    endDate?: string
): Promise<ExpenseSummary['byLocation']> {
    const summary = await getExpenseSummary(startDate, endDate);
    return summary.byLocation.sort((a, b) => b.total_amount - a.total_amount);
}

/**
 * Get daily or monthly expense trend.
 * Defaults to last 30 days (WIB).
 *
 * Groups raw analytics rows by day ('day') or month ('month').
 */
export async function getExpenseTrend(
    startDate?: string,
    endDate?: string,
    groupBy: 'day' | 'month' = 'day'
): Promise<ExpenseTrendPoint[]> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);

    if (analyticsConfigured()) {
        try {
            const rows = await getExpensesAnalytics(sd, ed);

            // Group by day or month
            const grouped = new Map<string, { total: number; count: number }>();

            for (const row of rows) {
                // Normalize date_wib: pg returns DATE as Date object
                const dateStr = groupBy === 'day'
                    ? normalizeExpenseDate(row.date_wib)
                    : normalizeExpenseDate(row.date_wib).substring(0, 7); // YYYY-MM
                const existing = grouped.get(dateStr) || { total: 0, count: 0 };
                existing.total += row.total_amount;
                existing.count += row.expense_count;
                grouped.set(dateStr, existing);
            }

            return Array.from(grouped.entries())
                .map(([date, data]) => ({
                    date,
                    total_amount: data.total,
                    expense_count: data.count,
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
        } catch (error) {
            console.warn('[expense] Analytics DB unavailable, falling back to safe empty:', error);
        }
    }

    return [];
}
