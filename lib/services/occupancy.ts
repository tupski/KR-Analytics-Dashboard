import { format, subDays, eachDayOfInterval } from 'date-fns';
import { createServerClient } from '@/lib/supabase/server';
import {
    getOccupancyDaily as getOccupancyDailyAnalytics,
    getOccupancyRate as getOccupancyRateAnalytics,
    getOccupancySummary as getOccupancySummaryAnalytics,
} from '@/lib/analytics/occupancy';

// ============================================================
// lib/services/occupancy.ts
//
// Occupancy-related service functions extracted from:
//   - dashboard/actions.ts  → fetchUnitStatus() + fetchOccupancyData()
//   - laporan/actions.ts    → fetchHighOccupancyLocations()
//
// Migration Phase 2B-5B:
//   Analytics DB first, Supabase fallback.
//   Old implementation kept for fallback.
//
// ⚠️ DEFINITION DIFFERENCE DOCUMENTED:
//   Legacy (Supabase): stay-span model — a room is occupied on a date
//     if checkin_at ≤ end_of_day AND checkout_at ≥ start_of_day. Multi-day
//     stays count on EVERY day they span.
//   Analytics DB: transaction-creation model — a room is occupied on a
//     date (WIB) if at least 1 transaction was created that day, based on
//     (created_at AT TIME ZONE 'Asia/Jakarta')::DATE.
//   These differ when stays span multiple days. Both are preserved
//   intentionally. See docs for full comparison.
//
// FUNCTIONS NOT MIGRATED (Supabase-only):
//   - getLiveOccupancy(): point-in-time active stay check, no analytics
//     table models real-time occupancy.
//   - getDailyCheckinVolume(): counts by checkin_at field, analytics DB
//     uses created_at — different semantics, irrelevant to migrate.
// ============================================================

export interface LiveOccupancyResult {
    tersedia: number;
    ditempati: number;
    total: number;
}

export interface DailyOccupancyTrendPoint {
    date: string;
    occupancyRate: number;
    occupiedUnits: number;
    totalUnits: number;
}

export interface RoomDayUtilizationItem {
    location: string;
    totalRooms: number;
    usedRoomDays: number;
    totalPossibleRoomDays: number;
    occupancyRate: number;
}

export interface DailyCheckinVolumePoint {
    date: string;
    count: number;
}

// ─── Helpers ────────────────────────────────────────────────

/** Check if analytics DB is configured. */
function analyticsConfigured(): boolean {
    return !!process.env.ANALYTICS_DATABASE_URL;
}

/** Normalize a date_wib value (Date object or string) to YYYY-MM-DD. */
function normalizeDate(d: unknown): string {
    if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    if (typeof d === 'string') return d;
    return String(d);
}

// ============================================================
// getLiveOccupancy()
//
// Get live occupancy: active stays right now.
// Active stay = checkin_at <= now AND checkout_at >= now.
//
// NOT MIGRATED TO ANALYTICS DB: No real-time occupancy table
// in analytics DB. Kept as Supabase-only.
//
// Mirrors fetchUnitStatus() in dashboard/actions.ts:42-85
// ============================================================
export async function getLiveOccupancy(): Promise<LiveOccupancyResult> {
    const supabase = createServerClient();

    try {
        // Get total rooms from nomor_kamar table
        const { count: totalRoomCount } = await supabase
            .from('nomor_kamar')
            .select('id', { count: 'exact', head: true });

        const totalRooms = totalRoomCount || 0;

        // Get distinct rooms currently occupied (checkin <= now AND checkout >= now)
        const now = new Date().toISOString();
        const { data: occupiedData, error: occError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location')
            .lte('checkin_at', now)
            .gte('checkout_at', now);

        if (occError) {
            console.error('Error fetching occupied rooms:', occError);
        }

        // Count unique occupied rooms
        const occupiedRooms = new Set(
            occupiedData?.map((t: any) => `${t.apartment_location}-${t.room_number}`) || []
        ).size;

        return {
            tersedia: Math.max(0, totalRooms - occupiedRooms),
            ditempati: occupiedRooms,
            total: totalRooms,
        };
    } catch (error) {
        console.error('Error in getLiveOccupancy:', error);
        // Return zeros instead of throwing to prevent dashboard from crashing
        return {
            tersedia: 0,
            ditempati: 0,
            total: 0,
        };
    }
}

// ============================================================
// getDailyOccupancyTrend(days=30)
//
// ⚠️ DEFINITION DIFFERENCE (see header):
//   Analytics path: room is occupied on date WIB if any transaction
//   was created that day (created_at AT TIME ZONE 'Asia/Jakarta')::DATE.
//   Legacy path: room is occupied on date if checkin_at ≤ dayEnd AND
//   checkout_at ≥ dayStart (stay-span model).
//
// Analytics path preferred, falls back to legacy Supabase.
// ============================================================
export async function getDailyOccupancyTrend(days: number = 30): Promise<DailyOccupancyTrendPoint[]> {
    // ── Analytics path (primary) ──────────────────────────────
    if (analyticsConfigured()) {
        try {
            const today = new Date();
            const startDate = subDays(today, days - 1);
            const sd = format(startDate, 'yyyy-MM-dd');
            const ed = format(new Date(today.getTime() + 86400000), 'yyyy-MM-dd'); // exclusive end

            const dailyRows = await getOccupancyDailyAnalytics(sd, ed);

            if (!dailyRows || dailyRows.length === 0) {
                return [];
            }

            // Count total rooms (distinct room_number per location)
            const roomsByLoc = new Map<string, Set<string>>();
            for (const row of dailyRows) {
                if (!roomsByLoc.has(row.apartment_location)) {
                    roomsByLoc.set(row.apartment_location, new Set());
                }
                roomsByLoc.get(row.apartment_location)!.add(row.room_number);
            }
            const totalRooms = Array.from(roomsByLoc.values()).reduce(
                (sum, s) => sum + s.size, 0
            );

            // Group by date, count occupied rooms
            const byDate = new Map<string, Set<string>>();
            for (const row of dailyRows) {
                const dateKey = normalizeDate(row.date_wib);
                if (!byDate.has(dateKey)) {
                    byDate.set(dateKey, new Set());
                }
                if (row.is_occupied) {
                    byDate.get(dateKey)!.add(`${row.apartment_location}-${row.room_number}`);
                }
            }

            // Build the full date range
            const allDays: Date[] = eachDayOfInterval({ start: startDate, end: today });
            const result: DailyOccupancyTrendPoint[] = allDays.map((d) => {
                const dateKey = format(d, 'yyyy-MM-dd');
                const occupiedUnits = byDate.get(dateKey)?.size || 0;
                const occupancyRate = totalRooms > 0
                    ? Math.round((occupiedUnits / totalRooms) * 10000) / 100
                    : 0;
                return {
                    date: dateKey,
                    occupancyRate,
                    occupiedUnits,
                    totalUnits: totalRooms,
                };
            });

            return result;
        } catch (error) {
            console.warn('[occupancy] Analytics DB unavailable, falling back to Supabase:', error);
        }
    }

    // ── Supabase fallback ────────────────────────────────────
    return getDailyOccupancyTrendLegacy(days);
}

/** Supabase-only fallback (unchanged, stay-span model). */
async function getDailyOccupancyTrendLegacy(days: number = 30): Promise<DailyOccupancyTrendPoint[]> {
    const supabase = createServerClient();
    const today = new Date();

    // Build the full date range: [startDate, today] inclusive
    const startDate = subDays(today, days - 1);
    const allDays: Date[] = eachDayOfInterval({ start: startDate, end: today });
    const formattedDays: string[] = allDays.map((d) => format(d, 'yyyy-MM-dd'));

    try {
        // Step 1: Get total room count from nomor_kamar table
        const { count: totalRooms, error: roomError } = await supabase
            .from('nomor_kamar')
            .select('id', { count: 'exact', head: true });

        if (roomError) {
            console.error('Error fetching room count for occupancy:', roomError);
            return [];
        }

        if (!totalRooms || totalRooms === 0) {
            // No rooms configured → all days have 0 occupancy
            return formattedDays.map((date) => ({
                date,
                occupancyRate: 0,
                occupiedUnits: 0,
                totalUnits: 0,
            }));
        }

        // Step 2: Fetch ALL transactions that could overlap the date range.
        const rangeStart = `${formattedDays[0]}T00:00:00`;
        const rangeEnd = `${formattedDays[formattedDays.length - 1]}T23:59:59`;

        const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, checkin_at, checkout_at')
            .lte('checkin_at', rangeEnd)
            .gte('checkout_at', rangeStart);

        if (txError) {
            console.error('Error fetching transactions for occupancy:', txError);
            return [];
        }

        // Step 3: For each day, count unique occupied rooms (stay-span model)
        const result: DailyOccupancyTrendPoint[] = formattedDays.map((day) => {
            const dayStart = `${day}T00:00:00`;
            const dayEnd = `${day}T23:59:59`;

            const occupiedOnDay = new Set<string>();

            if (transactions) {
                for (const tx of transactions) {
                    const checkin = (tx as any).checkin_at as string;
                    const checkout = (tx as any).checkout_at as string;

                    // Check overlap: checkin <= dayEnd AND checkout >= dayStart
                    if (checkin <= dayEnd && checkout >= dayStart) {
                        occupiedOnDay.add(`${(tx as any).apartment_location}-${(tx as any).room_number}`);
                    }
                }
            }

            const occupiedUnits = occupiedOnDay.size;
            const occupancyRate = totalRooms > 0
                ? Math.round((occupiedUnits / totalRooms) * 10000) / 100
                : 0;

            return {
                date: day,
                occupancyRate,
                occupiedUnits,
                totalUnits: totalRooms,
            };
        });

        return result;
    } catch (error) {
        console.error('Error in getDailyOccupancyTrend:', error);
        return [];
    }
}

// ============================================================
// getRoomDayUtilization(start, end)
//
// ⚠️ DEFINITION DIFFERENCE (see header):
//   Analytics path: uses is_occupied from analytics_occupancy_daily
//   (created_at WIB date). Legacy path: stay-span overlap model.
//
// Analytics path preferred, falls back to legacy Supabase.
// ============================================================
export async function getRoomDayUtilization(start: string, end: string): Promise<RoomDayUtilizationItem[]> {
    // ── Analytics path (primary) ──────────────────────────────
    if (analyticsConfigured()) {
        try {
            // Normalize dates
            const startDate = start.split('T')[0] || format(new Date(start), 'yyyy-MM-dd');
            let endDate = end.split('T')[0] || format(new Date(end), 'yyyy-MM-dd');
            // Analytics uses exclusive end, so add one day
            const endExclusive = format(
                new Date(new Date(endDate).getTime() + 86400000),
                'yyyy-MM-dd'
            );

            // Get occupancy rate per location per day from analytics
            const rateRows = await getOccupancyRateAnalytics(startDate, endExclusive);

            if (!rateRows || rateRows.length === 0) {
                return [];
            }

            // Calculate days in the period
            const startDt = new Date(startDate);
            const endDt = new Date(endDate);
            const periodDays = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)) + 1);

            // Aggregate per location across all days
            const perLocation = new Map<string, {
                totalRooms: number;
                usedRoomDays: number;
                totalPossibleRoomDays: number;
            }>();

            for (const row of rateRows) {
                const loc = row.apartment_location;
                if (!perLocation.has(loc)) {
                    perLocation.set(loc, { totalRooms: 0, usedRoomDays: 0, totalPossibleRoomDays: 0 });
                }
                const entry = perLocation.get(loc)!;
                // totalRooms per day — use row value (should be stable per location)
                entry.totalRooms = row.total_rooms;
                entry.usedRoomDays += row.occupied_rooms;
                entry.totalPossibleRoomDays += row.total_rooms;
            }

            const results: RoomDayUtilizationItem[] = Array.from(perLocation.entries())
                .map(([location, data]) => {
                    const occupancyRate = data.totalPossibleRoomDays > 0
                        ? Math.round((data.usedRoomDays / data.totalPossibleRoomDays) * 100)
                        : 0;
                    // Restore totalPossibleRoomDays = totalRooms * periodDays for consistency
                    return {
                        location,
                        totalRooms: data.totalRooms,
                        usedRoomDays: data.usedRoomDays,
                        totalPossibleRoomDays: data.totalRooms * periodDays,
                        occupancyRate,
                    };
                })
                .sort((a, b) => b.occupancyRate - a.occupancyRate);

            return results;
        } catch (error) {
            console.warn('[occupancy] Analytics DB unavailable, falling back to Supabase:', error);
        }
    }

    // ── Supabase fallback ────────────────────────────────────
    return getRoomDayUtilizationLegacy(start, end);
}

/** Supabase-only fallback (unchanged, stay-span model). */
async function getRoomDayUtilizationLegacy(start: string, end: string): Promise<RoomDayUtilizationItem[]> {
    const supabase = createServerClient();

    // Extract the date portion for string comparisons
    const startDate = start.split('T')[0] || format(new Date(start), 'yyyy-MM-dd');
    const endDate = end.split('T')[0] || format(new Date(end), 'yyyy-MM-dd');

    // Calculate number of days in the period
    const startDt = new Date(startDate);
    const endDt = new Date(endDate);
    const days = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const { data: allRooms } = await supabase.from('nomor_kamar').select('name, lokasi');

    // Fetch ALL transactions that could overlap the date range.
    const { data: transactions } = await supabase
        .from('transactions')
        .select('room_number, apartment_location, checkin_at, checkout_at')
        .lte('checkin_at', `${endDate}T23:59:59`)
        .gte('checkout_at', `${startDate}T00:00:00`);

    // Count rooms per location
    const roomsPerLocation: Record<string, number> = {};
    allRooms?.forEach((r: any) => {
        roomsPerLocation[r.lokasi] = (roomsPerLocation[r.lokasi] || 0) + 1;
    });

    // Build a lookup of all valid dates in the range for fast iteration
    const allDates: string[] = [];
    const cursor = new Date(startDt);
    while (cursor <= endDt) {
        allDates.push(format(cursor, 'yyyy-MM-dd'));
        cursor.setDate(cursor.getDate() + 1);
    }

    // Count unique room-days used per location.
    const locationUsage: Record<string, Set<string>> = {};
    transactions?.forEach((t: any) => {
        const loc = t.apartment_location;
        if (!locationUsage[loc]) locationUsage[loc] = new Set();

        // Determine the effective stay range within the query window
        const txCheckinDate = format(new Date(t.checkin_at), 'yyyy-MM-dd');
        const txCheckoutDate = format(new Date(t.checkout_at), 'yyyy-MM-dd');

        // Clamp to the query range
        const effectiveStart = txCheckinDate > startDate ? txCheckinDate : startDate;
        const effectiveEnd = txCheckoutDate < endDate ? txCheckoutDate : endDate;

        // Expand the stay into individual room-days
        for (const d of allDates) {
            if (d >= effectiveStart && d <= effectiveEnd) {
                const dayKey = `${t.room_number}|${d}`;
                locationUsage[loc].add(dayKey);
            }
        }
    });

    // Calculate occupancy rate per location
    const results: RoomDayUtilizationItem[] = Object.entries(roomsPerLocation)
        .map(([location, totalRooms]) => {
            const totalPossibleRoomDays = totalRooms * days;
            const usedRoomDays = locationUsage[location]?.size || 0;
            const occupancyRate = Math.round((usedRoomDays / totalPossibleRoomDays) * 100);
            return { location, totalRooms, usedRoomDays, totalPossibleRoomDays, occupancyRate };
        })
        .sort((a, b) => b.occupancyRate - a.occupancyRate);

    return results;
}

// ============================================================
// getDailyCheckinVolume(days=30)
//
// NOT MIGRATED TO ANALYTICS DB: Counts transactions by checkin_at
// date. Analytics DB stores occupancy by created_at date, not
// checkin_at — different field with different semantics. Kept as
// Supabase-only.
// ============================================================
export async function getDailyCheckinVolume(days: number = 30): Promise<DailyCheckinVolumePoint[]> {
    const supabase = createServerClient();
    const today = new Date();
    const startDate = subDays(today, days);

    try {
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('checkin_at')
            .gte('checkin_at', `${format(startDate, 'yyyy-MM-dd')}T00:00:00`)
            .lte('checkin_at', `${format(today, 'yyyy-MM-dd')}T23:59:59`)
            .order('checkin_at', { ascending: true });

        if (error) {
            console.error('Error fetching check-in volume:', error);
            return [];
        }

        if (!transactions || transactions.length === 0) {
            return [];
        }

        // Group by date and count
        const volumeMap = new Map<string, number>();

        transactions.forEach((tx: any) => {
            const date = format(new Date(tx.checkin_at), 'yyyy-MM-dd');
            volumeMap.set(date, (volumeMap.get(date) || 0) + 1);
        });

        const result: DailyCheckinVolumePoint[] = Array.from(volumeMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return result;
    } catch (error) {
        console.error('Error in getDailyCheckinVolume:', error);
        return [];
    }
}
