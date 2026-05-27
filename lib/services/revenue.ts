import { createServerClient } from '@/lib/supabase/server';

// ============================================================
// lib/services/revenue.ts
//
// Revenue-related service functions extracted from:
//   - dashboard/actions.ts  → fetchRevenueData() (RPC call)
//   - booking/actions.ts    → inline revenue aggregation
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

// ============================================================
// getRevenueSummary(start, end)
//
// Aggregate revenue = SUM(cash_amount + transfer_amount) for a
// given period.
// ============================================================
export async function getRevenueSummary(start: string, end: string): Promise<RevenueSummary> {
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

        const result: RevenueTrendPoint[] = (data as any[]).map((row: any) => ({
            date: row.date || row.day || '',
            revenue: Number(row.revenue || row.total_revenue || 0),
            transactionCount: Number(row.transaction_count || row.count || 0),
        }));

        return result;
    } catch (error) {
        console.error('Error in getRevenueTrend:', error);
        return [];
    }
}
