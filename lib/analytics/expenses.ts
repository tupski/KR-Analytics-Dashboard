import { queryAnalytics, parseNumeric } from './db';
import type { ExpenseSummary, ExpenseByDateRange } from './types';

function getDefaultDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
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

function resolveRange(startDate?: string, endDate?: string) {
    if (startDate) return { startDate, endDate: endDate ?? nextDay(startDate) };
    return getDefaultDateRange();
}

/**
 * Fetch raw expense summary rows within a date range.
 * Defaults to last 30 days (WIB).
 */
export async function getExpenses(
    startDate?: string,
    endDate?: string
): Promise<ExpenseSummary[]> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
    const rows = await queryAnalytics<ExpenseSummary>(
        `SELECT *
     FROM analytics_expense_summary
     WHERE date_wib >= $1 AND date_wib < $2
     ORDER BY date_wib, apartment_location, category`,
        [sd, ed]
    );
    return rows.map(r => ({
        ...r,
        total_amount: parseNumeric(r.total_amount),
        expense_count: parseNumeric(r.expense_count),
    }));
}

/**
 * Get aggregated expense summary for a date range,
 * with breakdowns by category and location.
 */
export async function getExpenseSummary(
    startDate?: string,
    endDate?: string
): Promise<ExpenseByDateRange> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);

    const totals = await queryAnalytics<{
        total_amount: string;
        total_expenses: string;
    }>(
        `SELECT
       COALESCE(SUM(total_amount), 0)  AS total_amount,
       COUNT(*)::text                  AS total_expenses
     FROM analytics_expense_summary
     WHERE date_wib >= $1 AND date_wib < $2`,
        [sd, ed]
    );

    const byCategory = await queryAnalytics<{
        category: string;
        total_amount: number;
        expense_count: number;
    }>(
        `SELECT
       category,
       SUM(total_amount)  AS total_amount,
       SUM(expense_count) AS expense_count
     FROM analytics_expense_summary
     WHERE date_wib >= $1 AND date_wib < $2
     GROUP BY category
     ORDER BY total_amount DESC`,
        [sd, ed]
    );

    const byLocation = await queryAnalytics<{
        apartment_location: string;
        total_amount: number;
        expense_count: number;
    }>(
        `SELECT
       apartment_location,
       SUM(total_amount)  AS total_amount,
       SUM(expense_count) AS expense_count
     FROM analytics_expense_summary
     WHERE date_wib >= $1 AND date_wib < $2
     GROUP BY apartment_location
     ORDER BY total_amount DESC`,
        [sd, ed]
    );

    const t = totals[0];
    return {
        startDate: sd,
        endDate: ed,
        totalAmount: parseNumeric(t.total_amount),
        totalExpenses: parseNumeric(t.total_expenses),
        byCategory: byCategory.map(c => ({
            category: c.category,
            total_amount: parseNumeric(c.total_amount),
            expense_count: parseNumeric(c.expense_count),
        })),
        byLocation: byLocation.map(l => ({
            apartment_location: l.apartment_location,
            total_amount: parseNumeric(l.total_amount),
            expense_count: parseNumeric(l.expense_count),
        })),
    };
}
