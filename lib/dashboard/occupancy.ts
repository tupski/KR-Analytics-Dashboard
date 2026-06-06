// ============================================================
// lib/dashboard/occupancy.ts
// Dashboard occupancy aggregation layer.
//
// Consolidates room count queries — accepts optional totalUnits
// from caller to avoid duplicate SELECT nomor_kamar queries.
// Uses lib/services/occupancy for live occupancy, trend, and
// location breakdown.
// ============================================================

import { createServerClient } from '@/lib/supabase/server';
import { getDailyOccupancyTrend, getLiveOccupancy } from '@/lib/services/occupancy';

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
 * Uses centralized getLiveOccupancy() for active-stay occupancy.
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

    // ── Fetch live occupancy, trend, and locations in parallel ─
    const [liveOccupancy, trend] = await Promise.all([
        getLiveOccupancy(),
        getDailyOccupancyTrend(30),
    ]);

    // ── Compute current occupancy from centralized function ──
    // Cap occupiedUnits at totalUnits to prevent >100% occupancy (safety net)
    const occupiedUnits = Math.min(liveOccupancy.ditempati, totalUnits);
    const occupancyRate =
        totalUnits > 0 ? Math.min(Math.round((occupiedUnits / totalUnits) * 10000) / 100, 100) : 0;

    // ── Format trend ─────────────────────────────────────────
    const trendFormatted: OccupancyTrendPoint[] = trend.map((t) => ({
        date: t.date,
        rate: t.occupancyRate,
    }));

    // ── Build per-location breakdown from liveOccupancy ──────
    const byLocation: OccupancyByLocation[] = liveOccupancy.locationBreakdown
        .map((loc) => ({
            location: loc.name,
            rate: loc.occupancyRate,
            occupied: loc.occupiedRooms,
            total: loc.totalRooms,
        }))
        .sort((a, b) => b.rate - a.rate);

    return {
        occupancyRate,
        occupiedUnits,
        totalUnits,
        trend: trendFormatted,
        byLocation,
    };
}
