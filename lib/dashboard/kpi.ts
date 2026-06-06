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
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

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

    const TZ = 'Asia/Jakarta';

    // ── Room count — use pre-fetched value if provided ───────
    const totalUnits = params.totalUnits ?? (await getTotalRoomCount());

    const startISO = params.startDate.toISOString();
    const endISO = params.endDate.toISOString();
    // Use WIB-aware date strings, not UTC-split
    const startStr = format(toZonedTime(params.startDate, TZ), 'yyyy-MM-dd');
    const endStr = format(toZonedTime(params.endDate, TZ), 'yyyy-MM-dd');

    // ── Build queries (apply location filter once) ───────────
    let bookingsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        // COALESCE(checkin_at, created_at): wider filter via .or()
        .or(`checkin_at.gte.${startISO},and(checkin_at.is.null,created_at.gte.${startISO})`);
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
        .or(`checkin_at.gte.${todayBoundaries.startISO},and(checkin_at.is.null,created_at.gte.${todayBoundaries.startISO})`);
    if (params.location) checkinsQuery = checkinsQuery.eq('apartment_location', params.location);

    let checkoutsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('checkout_at', todayBoundaries.startISO)
        .lt('checkout_at', todayBoundaries.endISO);
    if (params.location) checkoutsQuery = checkoutsQuery.eq('apartment_location', params.location);

    const [{ count: checkinsToday }, { count: checkoutsToday }] =
        await Promise.all([checkinsQuery, checkoutsQuery]);

    // ── Compute derived values ──────────────────────────────
    const activeStays = liveOccupancy.ditempati;

    let totalRevenue = revenueSummary.totalRevenue;
    const totalExpenses = expenseSummary.totalAmount;

    // ── Today fallback: if analytics has no data for today, query raw transactions ──
    const todayWIB = format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd');
    const todayStartStr = `${todayWIB}T00:00:00+07:00`;
    const todayEndStr = `${todayWIB}T23:59:59+07:00`;

    console.log('[Dashboard KPI] period revenue from service:', totalRevenue);
    console.log('[Dashboard KPI] period range:', startStr, '→', endStr);
    console.log('[Dashboard KPI] today WIB:', todayWIB);

    // Only run fallback when the range includes today
    if (todayWIB >= startStr && todayWIB <= endStr) {
        // Use COALESCE(checkin_at, created_at) via .or() filter: checkin_at >= start OR (checkin IS NULL AND created_at >= start)
        const { data: todayTx, error: todayErr } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount, checkin_at, created_at')
            .or(`checkin_at.gte.${todayStartStr},and(checkin_at.is.null,created_at.gte.${todayStartStr})`)
            .lt('checkin_at', todayEndStr);  // exclusive end

        if (!todayErr && todayTx && todayTx.length > 0) {
            let todayRevenue = 0;
            let todayCount = 0;
            for (const tx of todayTx) {
                const effDate = tx.checkin_at || tx.created_at;
                if (effDate && effDate >= todayStartStr && effDate < todayEndStr) {
                    todayRevenue += (tx.cash_amount || 0) + (tx.transfer_amount || 0);
                    todayCount++;
                }
            }

            console.log('[Dashboard KPI] today raw transaction count:', todayCount);
            console.log('[Dashboard KPI] today raw revenue sum:', todayRevenue);

            // Override period revenue if service returned 0 but we have real data
            if (totalRevenue === 0 && todayRevenue > 0) {
                totalRevenue = todayRevenue;
                console.log('[Dashboard KPI] revenue overridden with today raw value:', totalRevenue);
            }
        } else if (todayErr) {
            console.warn('[Dashboard KPI] today fallback query error:', todayErr);
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
