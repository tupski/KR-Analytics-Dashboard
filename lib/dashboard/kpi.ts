// ============================================================
// lib/dashboard/kpi.ts
// Dashboard KPI aggregation layer.
//
// Consolidates room count queries — accepts optional totalUnits
// from caller to avoid duplicate SELECT nomor_kamar queries.
// Uses lib/services/* (revenue, expense, occupancy) as data backends.
// ============================================================

import { createServerClient } from '@/lib/supabase/server';
import type { ReportPeriodRange } from '@/lib/shared/report-period';
import { getReportPeriodRange } from '@/lib/shared/report-period';
import { getRevenueSummary as getServiceRevenueSummary } from '@/lib/services/revenue';
import { getExpenseSummary as getServiceExpenseSummary } from '@/lib/services/expense';
import { getLiveOccupancy } from '@/lib/services/occupancy';
import { calcRevenue, effectiveDate } from '@/lib/dashboard/transaction-source';

// ─── Helpers ────────────────────────────────────────────────

async function getTotalRoomCount(): Promise<number> {
    const supabase = createServerClient();
    const { count } = await supabase
        .from('nomor_kamar')
        .select('id', { count: 'exact', head: true });
    return count || 0;
}

// ─── Public API ─────────────────────────────────────────────

export interface KPIDataResult {
    totalBookings: number;
    totalRevenue: number;
    totalExpenses: number;
    netRevenue: number;
    activeStays: number;
    checkinsToday: number;
    checkoutsToday: number;
    occupancyRate: number;
    availableUnits: number;
    totalUnits: number;
}

/**
 * Fetch all KPI data for the dashboard.
 *
 * Queries total rooms ONCE — pass `totalUnits` from the caller to
 * skip the room count query (avoids duplication across aggregation
 * functions).
 *
 * Uses centralized getLiveOccupancy() for active-stay occupancy.
 *
 * @param params.period     Report period range from shared helper
 * @param params.location   Optional location filter
 * @param params.totalUnits Pre-fetched room count (skip query)
 */
export async function getKPIData(params: {
    period: ReportPeriodRange;
    location?: string;
    totalUnits?: number;
}): Promise<KPIDataResult> {
    const supabase = createServerClient();

    const TZ = 'Asia/Jakarta';

    // ── Room count — use pre-fetched value if provided ───────
    const totalUnits = params.totalUnits ?? (await getTotalRoomCount());

    const { period } = params;

    // ── Build bookings query (apply location filter once) ─────
    let bookingsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        // COALESCE(checkin_at, created_at): wider filter via .or() with start-end boundary
        .or(
            `and(checkin_at.gte.${period.startISO},checkin_at.lt.${period.endExclusiveISO}),` +
            `and(checkin_at.is.null,created_at.gte.${period.startISO},created_at.lt.${period.endExclusiveISO})`
        );
    if (params.location) bookingsQuery = bookingsQuery.eq('apartment_location', params.location);

    // ── Today boundaries for checkins/checkouts (separate from period) ──
    const todayPeriod = getReportPeriodRange({ preset: 'today', timezone: TZ });

    // ── Fetch period-bound data in parallel ──────────────────
    const [{ count: bookingCount }, revenueSummary, expenseSummary, liveOccupancy] =
        await Promise.all([
            bookingsQuery,
            getServiceRevenueSummary(period),
            getServiceExpenseSummary(period.startDate, period.endDate),
            getLiveOccupancy(),
        ]);

    // ── Fetch today checkins/checkouts in parallel ───────────
    let checkinsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .or(
            `and(checkin_at.gte.${todayPeriod.startISO},checkin_at.lt.${todayPeriod.endExclusiveISO}),` +
            `and(checkin_at.is.null,created_at.gte.${todayPeriod.startISO},created_at.lt.${todayPeriod.endExclusiveISO})`
        );
    if (params.location) checkinsQuery = checkinsQuery.eq('apartment_location', params.location);

    let checkoutsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('checkout_at', todayPeriod.startISO)
        .lt('checkout_at', todayPeriod.endExclusiveISO);
    if (params.location) checkoutsQuery = checkoutsQuery.eq('apartment_location', params.location);

    const [{ count: checkinsToday }, { count: checkoutsToday }] =
        await Promise.all([checkinsQuery, checkoutsQuery]);

    // ── Compute derived values ──────────────────────────────
    const activeStays = liveOccupancy.ditempati;

    let totalRevenue = revenueSummary.totalRevenue;
    const totalExpenses = expenseSummary.totalAmount;

    // ── Today fallback: if analytics has no data for today, query raw transactions ──
    // This fixes the Rp 0 bug: when the analytics_daily_revenue table hasn't been
    // synced yet for today, we fall back to querying the transactions table directly
    // using the same COALESCE(checkin_at, created_at) effective-date pattern.
    console.debug('[Dashboard KPI] period revenue from service:', totalRevenue);
    console.debug('[Dashboard KPI] period:', {
        preset: period.preset,
        startISO: period.startISO,
        endExclusiveISO: period.endExclusiveISO,
        startDate: period.startDate,
        endDate: period.endDate,
    });

    // Only run fallback when revenue is 0 AND the period includes today
    if (totalRevenue === 0) {
        const todayWIB = todayPeriod.startDate; // YYYY-MM-DD in WIB
        const periodStartWIB = period.startDate;
        const periodEndWIB = period.endDate;

        // Check if today is within the period range
        if (todayWIB >= periodStartWIB && todayWIB <= periodEndWIB) {
            console.debug('[Dashboard KPI] revenue is 0, running today fallback query...');

            // Use COALESCE(checkin_at, created_at) via .or() filter
            // checkin_at >= todayStartISO OR (checkin_at IS NULL AND created_at >= todayStartISO)
            const { data: todayTx, error: todayErr } = await supabase
                .from('transactions')
                .select('cash_amount, transfer_amount, checkin_at, created_at')
                .or(
                    `and(checkin_at.gte.${todayPeriod.startISO},checkin_at.lt.${todayPeriod.endExclusiveISO}),` +
                    `and(checkin_at.is.null,created_at.gte.${todayPeriod.startISO},created_at.lt.${todayPeriod.endExclusiveISO})`
                );

            if (!todayErr && todayTx && todayTx.length > 0) {
                let todayRevenue = 0;
                let todayCount = 0;
                for (const tx of todayTx) {
                    const effDate = effectiveDate(tx);
                    // Apply exclusive-end: effective_date >= start AND effective_date < end
                    if (effDate && effDate >= todayPeriod.startISO && effDate < todayPeriod.endExclusiveISO) {
                        todayRevenue += calcRevenue(tx);
                        todayCount++;
                    }
                }

                console.debug('[Dashboard KPI] today fallback result:', { todayCount, todayRevenue });

                if (todayRevenue > 0) {
                    totalRevenue = todayRevenue;
                    console.debug('[Dashboard KPI] revenue overridden with today raw value:', totalRevenue);
                }
            } else if (todayErr) {
                console.warn('[Dashboard KPI] today fallback query error:', todayErr);
            } else {
                console.debug('[Dashboard KPI] today fallback: no transactions found for today');
            }
        }
    }

    const occupancyRate =
        totalUnits > 0 ? Math.round((activeStays / totalUnits) * 10000) / 100 : 0;
    const availableUnits = Math.max(0, totalUnits - activeStays);

    return {
        totalBookings: bookingCount || 0,
        totalRevenue,
        totalExpenses,
        netRevenue: totalRevenue - totalExpenses,
        activeStays,
        checkinsToday: checkinsToday || 0,
        checkoutsToday: checkoutsToday || 0,
        occupancyRate,
        availableUnits,
        totalUnits,
    };
}
