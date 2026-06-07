import { getReportPeriodRange } from '@/lib/shared/report-period';
import type { ReportPeriodMode, ReportPeriodRange } from '@/lib/shared/report-period';
import { getRevenueSummary } from '@/lib/services/revenue';
import { getExpenseSummary } from '@/lib/services/expense';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';

export interface PeriodSummaryInput {
    startDate: string; // 'YYYY-MM-DD'
    endDate: string;   // 'YYYY-MM-DD'
    mode?: string;
    timezone?: string;
}

export interface CanonicalPeriodSummary {
    period: ReportPeriodRange;
    revenue: {
        totalRevenue: number;
        cashAmount: number;
        transferAmount: number;
        transactionCount: number;
    };
    expenses: {
        totalAmount: number;
        totalExpenses: number;
        startDate: string;
        endDate: string;
        byCategory: Array<{ category: string; total_amount: number; expense_count: number }>;
        byLocation: Array<{ apartment_location: string; total_amount: number; expense_count: number }>;
    };
    netProfit: number;
}

export async function getCanonicalPeriodSummary(input: PeriodSummaryInput): Promise<CanonicalPeriodSummary> {
    const mode = (input.mode as ReportPeriodMode) ?? (await getReportPeriodSetting());
    const timezone = input.timezone ?? 'Asia/Jakarta';

    const period = getReportPeriodRange({
        preset: 'custom',
        startDate: input.startDate,
        endDate: input.endDate,
        mode,
        timezone,
    });

    const [revenue, expenses] = await Promise.all([
        getRevenueSummary(period),
        getExpenseSummary(undefined, undefined, period),
    ]);

    return {
        period,
        revenue,
        expenses,
        netProfit: revenue.totalRevenue - expenses.totalAmount,
    };
}
