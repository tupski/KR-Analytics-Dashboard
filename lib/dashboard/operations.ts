// ============================================================
// lib/dashboard/operations.ts
// Dashboard operations aggregation layer.
//
// Fetches today's check-ins, check-outs, active stays, and due
// checkouts. Uses lib/dashboard/periods for date boundaries.
// ============================================================

import { createServerClient } from '@/lib/supabase/server';
import { getDateBoundariesISO } from '@/lib/dashboard/periods';
import { getNowWIB } from '@/lib/utils/format';

// ─── Public Types ───────────────────────────────────────────

export interface ActiveStayItem {
    id: string;
    apartmentLocation: string;
    roomNumber: string;
    customerName: string;
    checkinAt: Date;
    checkoutAt: Date | null;
}

export interface DueCheckoutItem {
    id: string;
    apartmentLocation: string;
    roomNumber: string;
    customerName: string;
    checkoutAt: Date;
}

export interface OperationsSummaryResult {
    checkinsToday: number;
    checkoutsToday: number;
    activeStays: ActiveStayItem[];
    dueCheckouts: DueCheckoutItem[];
}

/**
 * Fetch today's operations summary.
 *
 * - checkinsToday: count of transactions with checkin in today's period
 * - checkoutsToday: count of transactions with checkout in today's period
 * - activeStays: currently checked-in stays (overlap model)
 * - dueCheckouts: stays with checkout window today (may overlap with activeStays)
 *
 * @param params.startDate  Period start (reserved for future range use)
 * @param params.endDate    Period end (reserved for future range use)
 * @param params.location   Optional location filter
 */
export async function getOperationsSummary(params: {
    startDate: Date;
    endDate: Date;
    location?: string;
}): Promise<OperationsSummaryResult> {
    const supabase = createServerClient();
    const todayBoundaries = await getDateBoundariesISO(new Date());
    const nowISO = getNowWIB();

    // ── Build queries ────────────────────────────────────────
    let checkinsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        // COALESCE(checkin_at, created_at): wider filter for null checkin_at
        .or(`checkin_at.gte.${todayBoundaries.startISO},and(checkin_at.is.null,created_at.gte.${todayBoundaries.startISO})`);
    if (params.location) checkinsQuery = checkinsQuery.eq('apartment_location', params.location);

    let checkoutsQuery = supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .gte('checkout_at', todayBoundaries.startISO)
        .lt('checkout_at', todayBoundaries.endISO);
    if (params.location) checkoutsQuery = checkoutsQuery.eq('apartment_location', params.location);

    let activeQuery = supabase
        .from('transactions')
        .select('id, apartment_location, room_number, customer_name, checkin_at, checkout_at')
        .lte('checkin_at', nowISO)
        .or(`checkout_at.gte.${nowISO},checkout_at.is.null`)
        .order('checkin_at', { ascending: true });
    if (params.location) activeQuery = activeQuery.eq('apartment_location', params.location);

    let dueQuery = supabase
        .from('transactions')
        .select('id, apartment_location, room_number, customer_name, checkout_at')
        .gte('checkout_at', todayBoundaries.startISO)
        .lte('checkout_at', todayBoundaries.endISO)
        .order('checkout_at', { ascending: true });
    if (params.location) dueQuery = dueQuery.eq('apartment_location', params.location);

    // ── Execute all queries in parallel ──────────────────────
    const [{ count: checkinsToday }, { count: checkoutsToday }, { data: activeData }, { data: dueData }] =
        await Promise.all([checkinsQuery, checkoutsQuery, activeQuery, dueQuery]);

    // ── Map results ──────────────────────────────────────────
    const activeStays: ActiveStayItem[] = (activeData || []).map((t: any) => ({
        id: t.id,
        apartmentLocation: t.apartment_location,
        roomNumber: t.room_number,
        customerName: t.customer_name,
        checkinAt: new Date(t.checkin_at),
        checkoutAt: t.checkout_at ? new Date(t.checkout_at) : null,
    }));

    const dueCheckouts: DueCheckoutItem[] = (dueData || []).map((t: any) => ({
        id: t.id,
        apartmentLocation: t.apartment_location,
        roomNumber: t.room_number,
        customerName: t.customer_name,
        checkoutAt: new Date(t.checkout_at),
    }));

    return {
        checkinsToday: checkinsToday || 0,
        checkoutsToday: checkoutsToday || 0,
        activeStays,
        dueCheckouts,
    };
}
