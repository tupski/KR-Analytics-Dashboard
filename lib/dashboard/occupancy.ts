// ============================================================
// lib/dashboard/occupancy.ts
// Dashboard occupancy aggregation layer.
//
// Consolidates room count queries — accepts optional totalUnits
// from caller to avoid duplicate SELECT nomor_kamar queries.
// Uses lib/services/occupancy for trend and lib/services/location
// for per-location breakdown.
// ============================================================

import { createServerClient } from '@/lib/supabase/server';
import { getDailyOccupancyTrend } from '@/lib/services/occupancy';
import { getLocations } from '@/lib/services/location';

// ─── Helpers ────────────────────────────────────────────────

async function getTotalRoomCount(): Promise<number> {
    const supabase = createServerClient();
    const { count } = await supabase
        .from('nomor_kamar')
        .select('id', { count: 'exact', head: true });
    return count || 0;
}

// ─── Public API ─────────────────────────────────────────────

export interface OccupancyTrendPoint {
    date: string;
    rate: number;
}

export interface OccupancyByLocation {
    location: string;
    rate: number;
    occupied: number;
    total: number;
}

export interface OccupancySummaryResult {
    occupancyRate: number;
    occupiedUnits: number;
    totalUnits: number;
    trend: OccupancyTrendPoint[];
    byLocation: OccupancyByLocation[];
}

/**
 * Fetch occupancy summary: current rate, trend, and per-location
 * breakdown.
 *
 * Queries total rooms ONCE — pass `totalUnits` from the caller to
 * skip the room count query (avoids duplication across aggregation
 * functions).
 *
 * @param params.startDate  Period start (for trend range start)
 * @param params.endDate    Period end (for trend range end)
 * @param params.location   Optional location filter
 * @param params.totalUnits Pre-fetched room count (skip query)
 */
export async function getOccupancySummary(params: {
    startDate: Date;
    endDate: Date;
    location?: string;
    totalUnits?: number;
}): Promise<OccupancySummaryResult> {
    const supabase = createServerClient();

    // ── Room count — use pre-fetched value if provided ───────
    const totalUnits = params.totalUnits ?? (await getTotalRoomCount());

    // ── Current occupancy (point-in-time, stay-span overlap) ─
    const nowISO = new Date().toISOString();

    let occQuery = supabase
        .from('transactions')
        .select('room_number, apartment_location')
        .lte('checkin_at', nowISO)
        .or(`checkout_at.gte.${nowISO},checkout_at.is.null`);
    if (params.location) occQuery = occQuery.eq('apartment_location', params.location);

    // ── Fetch trend and locations in parallel with occupancy ─
    const [occResult, trend, locations] = await Promise.all([
        occQuery,
        getDailyOccupancyTrend(30),
        getLocations(),
    ]);

    // ── Compute current occupancy ────────────────────────────
    const occupiedSet = new Set(
        (occResult.data || []).map((t: any) => `${t.apartment_location}-${t.room_number}`),
    );
    const occupiedUnits = occupiedSet.size;
    const occupancyRate =
        totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 10000) / 100 : 0;

    // ── Format trend ─────────────────────────────────────────
    const trendFormatted: OccupancyTrendPoint[] = trend.map((t) => ({
        date: t.date,
        rate: t.occupancyRate,
    }));

    // ── Build per-location breakdown ─────────────────────────
    // Count occupied per location from the same occResult data
    const occPerLocation = new Map<string, Set<string>>();
    (occResult.data || []).forEach((t: any) => {
        const loc = t.apartment_location;
        if (!occPerLocation.has(loc)) occPerLocation.set(loc, new Set());
        occPerLocation.get(loc)!.add(`${t.apartment_location}-${t.room_number}`);
    });

    // Use locations from service (avoids another nomor_kamar query)
    const byLocation: OccupancyByLocation[] = locations
        .map((loc) => {
            const total = loc.totalRooms;
            const occupied = occPerLocation.get(loc.name)?.size || 0;
            const rate = total > 0 ? Math.round((occupied / total) * 10000) / 100 : 0;
            return { location: loc.name, rate, occupied, total };
        })
        .sort((a, b) => b.rate - a.rate);

    return {
        occupancyRate,
        occupiedUnits,
        totalUnits,
        trend: trendFormatted,
        byLocation,
    };
}
