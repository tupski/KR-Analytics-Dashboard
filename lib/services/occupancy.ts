import { format, subDays, eachDayOfInterval } from 'date-fns';
import { createServerClient } from '@/lib/supabase/server';

// ============================================================
// lib/services/occupancy.ts
//
// Occupancy-related service functions extracted from:
//   - dashboard/actions.ts  → fetchUnitStatus() + fetchOccupancyData()
//   - laporan/actions.ts    → fetchHighOccupancyLocations()
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

// ============================================================
// getLiveOccupancy()
//
// Get live occupancy: active stays right now.
// Active stay = checkin_at <= now AND checkout_at >= now.
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
// TRUE DAILY OCCUPANCY: For each date in the range [startDate, today],
// a room is occupied if there exists ANY transaction where:
//   checkin_at  <= end   of that day   (23:59:59 on that date)
//   checkout_at >= start of that day   (00:00:00 on that date)
//
// This is fundamentally different from "daily check-in volume"
// (which count() does below) because multi-day stays count as
// occupied on EVERY day of the stay, not just the check-in day.
//
// Example: A guest checking in on Jan 1 and out on Jan 5 occupies
// a room on Jan 1, 2, 3, 4, AND 5 — all 5 days.
//
// CONTRAST with getDailyCheckinVolume() below:
//   - daily check-in volume = # of transactions whose checkin_at
//     falls exactly on a given date (ignores stay length)
//   - daily occupancy        = # of unique rooms occupied on a
//     given date based on checkin/checkout overlap (counts all
//     days of multi-day stays)
// ============================================================
export async function getDailyOccupancyTrend(days: number = 30): Promise<DailyOccupancyTrendPoint[]> {
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
        // We need checkout_at to determine if a stay spans across days.
        // Query: checkin_at <= rangeEnd (23:59:59) AND checkout_at >= rangeStart (00:00:00)
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

        // Step 3: For each day in the range, count unique occupied rooms.
        // A room is occupied on a given day if:
        //   checkin_at  <= dayEnd   (23:59:59 on that day)
        //   checkout_at >= dayStart (00:00:00 on that day)
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
// For each location, calculate usedRoomDays / totalPossibleRoomDays
// * 100 over the period.
//
// IMPORTANT — check-in volume ≠ occupancy/utilization:
//   - Counting transactions by checkin_at tells you how many guests
//     arrived on a given day, NOT how many rooms were occupied.
//   - Utilization must account for the full stay-span (checkin_at
//     through checkout_at) because multi-day stays occupy rooms on
//     EVERY day of the stay, not just the check-in day.
//
// This function now uses the SAME stay-span overlap logic as
// getDailyOccupancyTrend():
//   checkin_at  <= dayEnd   (23:59:59)
//   checkout_at >= dayStart (00:00:00)
//
// Each transaction is expanded into all room-days it spans within
// the query range, then unique (room, date) pairs are counted.
//
// Mirrors fetchHighOccupancyLocations() in laporan/actions.ts:406-447
// ============================================================
export async function getRoomDayUtilization(start: string, end: string): Promise<RoomDayUtilizationItem[]> {
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
    // This is the same overlap query used by getDailyOccupancyTrend():
    //   checkin_at <= rangeEnd   AND   checkout_at >= rangeStart
    // We need checkout_at to expand multi-day stays across all occupied dates.
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
    // For each transaction, expand across ALL dates the stay spans
    // (clamped to the query range), then record each (room, date) pair.
    const locationUsage: Record<string, Set<string>> = {};
    transactions?.forEach((t: any) => {
        const loc = t.apartment_location;
        if (!locationUsage[loc]) locationUsage[loc] = new Set();

        // Determine the effective stay range within the query window
        const txCheckinDate = format(new Date(t.checkin_at), 'yyyy-MM-dd');
        const txCheckoutDate = format(new Date(t.checkout_at), 'yyyy-MM-dd');

        // Clamp to the query range: stay starts at max(checkin_date, range_start)
        // and ends at min(checkout_date, range_end)
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
// Simpler version — just count check-ins per date.
//
// Groups transactions by checkin_at date and counts rows.
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
