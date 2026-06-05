// ============================================================
// lib/dashboard/kpi.ts
// Dashboard KPI aggregation layer.
//
// Consolidates room count queries — accepts optional totalUnits
// from caller to avoid duplicate SELECT nomor_kamar queries.
// Uses lib/services/* (revenue, expense, occupancy) as data backends.
// ============================================================

import { createServerClient } from '@/lib/supabase/server';
import { getRevenueSummary as getServiceRevenueSummary } from '@/lib/services/revenue';
import { getExpenseSummary as getServiceExpenseSummary } from '@/lib/services/expense';
import { getLiveOccupancy } from '@/lib/services/occupancy';
import { getDateBoundariesISO } from '@/lib/dashboard/periods';

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
 * @param params.startDate  Period start
 * @param params.endDate    Period end
 * @param params.location   Optional location filter
 * @param params.totalUnits Pre-fetched room count (skip query)
 */
export async function getKPIData(params: {
    startDate: Date;
    endDate: Date;
    location?: string;
    totalUnits?: number;
}): Promise<KPIDataResult> {
    const supabase = createServerClient();

    // ── Room count — use pre-fetched value if provided ───────
    const totalUnits = params.totalUnits ?? (await getTotalRoomCount());

    const startISO = params.startDate.toISOString();
    const endISO = params.endDate.toISOString();
    const startStr = params.startDate.toISOString().split('T')[0];
    const endStr = params.endDate.toISOString().split('T')[0];

    // ── Build queries (apply location filter once) ───────────
    let bookingsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('checkin_at', startISO)
        .lte('checkin_at', endISO);
    if (params.location) bookingsQuery = bookingsQuery.eq('apartment_location', params.location);

    // ── Fetch period-bound data in parallel ──────────────────
    const [{ count: bookingCount }, revenueSummary, expenseSummary, todayBoundaries, liveOccupancy] =
        await Promise.all([
            bookingsQuery,
            getServiceRevenueSummary(startStr, endStr),
            getServiceExpenseSummary(startStr, endStr),
            getDateBoundariesISO(new Date()),
            getLiveOccupancy(),
        ]);

    // ── Fetch today checkins/checkouts in parallel ───────────
    let checkinsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('checkin_at', todayBoundaries.startISO)
        .lte('checkin_at', todayBoundaries.endISO);
    if (params.location) checkinsQuery = checkinsQuery.eq('apartment_location', params.location);

    let checkoutsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('checkout_at', todayBoundaries.startISO)
        .lte('checkout_at', todayBoundaries.endISO);
    if (params.location) checkoutsQuery = checkoutsQuery.eq('apartment_location', params.location);

    const [{ count: checkinsToday }, { count: checkoutsToday }] =
        await Promise.all([checkinsQuery, checkoutsQuery]);

    // ── Compute derived values ──────────────────────────────
    const activeStays = liveOccupancy.ditempati;

    const totalRevenue = revenueSummary.totalRevenue;
    const totalExpenses = expenseSummary.totalAmount;
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
