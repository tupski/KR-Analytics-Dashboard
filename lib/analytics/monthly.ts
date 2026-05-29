import { queryAnalytics } from './db';
import type { MonthlySummary, MonthlyComparison } from './types';

function getDefaultYearMonth(): {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
} {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const curYear = wib.getFullYear();
    const curMonth = wib.getMonth() + 1; // 1-based

    // End = previous complete month (current month may be partial)
    let endYear = curYear;
    let endMonth = curMonth - 1;
    if (endMonth < 1) {
        endMonth = 12;
        endYear -= 1;
    }

    // Start = 3 months before end
    let startYear = endYear;
    let startMonth = endMonth - 2;
    if (startMonth < 1) {
        startMonth += 12;
        startYear -= 1;
    }

    return { startYear, startMonth, endYear, endMonth };
}

/**
 * Fetch monthly summaries for a given year-month range.
 * Defaults to the last 3 complete months.
 */
export async function getMonthlySummaries(
    startYear?: number,
    startMonth?: number,
    endYear?: number,
    endMonth?: number
): Promise<MonthlySummary[]> {
    const def = getDefaultYearMonth();
    const sy = startYear ?? def.startYear;
    const sm = startMonth ?? def.startMonth;
    const ey = endYear ?? def.endYear;
    const em = endMonth ?? def.endMonth;

    return queryAnalytics<MonthlySummary>(
        `SELECT *
     FROM analytics_monthly_summary
     WHERE (year > $1 OR (year = $1 AND month >= $2))
       AND (year < $3 OR (year = $3 AND month <= $4))
     ORDER BY year DESC, month DESC, apartment_location`,
        [sy, sm, ey, em]
    );
}

/**
 * Get month-over-month comparison across all locations.
 * Returns one row per year-month.
 */
export async function getMonthlyComparison(
    startYear?: number,
    startMonth?: number,
    endYear?: number,
    endMonth?: number
): Promise<MonthlyComparison[]> {
    const def = getDefaultYearMonth();
    const sy = startYear ?? def.startYear;
    const sm = startMonth ?? def.startMonth;
    const ey = endYear ?? def.endYear;
    const em = endMonth ?? def.endMonth;

    return queryAnalytics<MonthlyComparison>(
        `SELECT
       (year || '-' || LPAD(month::text, 2, '0')) AS "yearMonth",
       SUM(total_revenue)      AS "revenue",
       SUM(total_expenses)     AS "expenses",
       SUM(net_profit)         AS "netProfit",
       SUM(transaction_count)  AS "transactions",
       SUM(paid_bills_count)   AS "paidBills",
       SUM(unpaid_bills_count) AS "unpaidBills"
     FROM analytics_monthly_summary
     WHERE (year > $1 OR (year = $1 AND month >= $2))
       AND (year < $3 OR (year = $3 AND month <= $4))
     GROUP BY year, month
     ORDER BY year DESC, month DESC`,
        [sy, sm, ey, em]
    );
}
