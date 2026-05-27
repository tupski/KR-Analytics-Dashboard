import { format, subDays } from 'date-fns';
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
// Get daily occupancy trend over N days.
// Groups check-ins by date and counts unique rooms per day.
//
// Mirrors fetchOccupancyData() in dashboard/actions.ts:527-590
// (note: the original function is named "occupancy" but actually
// computes daily check-in counts; this is preserved as occupancy trend)
// ============================================================
export async function getDailyOccupancyTrend(days: number = 30): Promise<DailyOccupancyTrendPoint[]> {
    const supabase = createServerClient();
    const today = new Date();
    const startDate = subDays(today, days);

    try {
        // Get total rooms from nomor_kamar table
        const { count: totalRooms, error: roomError } = await supabase
            .from('nomor_kamar')
            .select('id', { count: 'exact', head: true });

        if (roomError) {
            console.error('Error fetching room count for occupancy:', roomError);
            return [];
        }

        if (!totalRooms || totalRooms === 0) {
            return [];
        }

        // Get transactions in the date range
        const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, checkin_at')
            .gte('checkin_at', `${format(startDate, 'yyyy-MM-dd')}T00:00:00`)
            .lte('checkin_at', `${format(today, 'yyyy-MM-dd')}T23:59:59`)
            .order('checkin_at', { ascending: true });

        if (txError) {
            console.error('Error fetching transactions for occupancy:', txError);
            return [];
        }

        if (!transactions || transactions.length === 0) {
            return [];
        }

        // Group by date and count unique rooms occupied per day
        const dailyOccupancy = new Map<string, Set<string>>();

        transactions.forEach((tx: any) => {
            const date = format(new Date(tx.checkin_at), 'yyyy-MM-dd');
            if (!dailyOccupancy.has(date)) {
                dailyOccupancy.set(date, new Set());
            }
            dailyOccupancy.get(date)!.add(`${tx.apartment_location}-${tx.room_number}`);
        });

        // Convert to DailyOccupancyTrendPoint array
        const result: DailyOccupancyTrendPoint[] = Array.from(dailyOccupancy.entries())
            .map(([date, rooms]) => ({
                date,
                occupancyRate: Math.round((rooms.size / totalRooms) * 10000) / 100,
                occupiedUnits: rooms.size,
                totalUnits: totalRooms,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

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
    const { data: transactions } = await supabase
        .from('transactions')
        .select('room_number, apartment_location, checkin_at')
        .gte('checkin_at', `${startDate}T00:00:00`)
        .lte('checkin_at', `${endDate}T23:59:59`);

    // Count rooms per location
    const roomsPerLocation: Record<string, number> = {};
    allRooms?.forEach((r: any) => {
        roomsPerLocation[r.lokasi] = (roomsPerLocation[r.lokasi] || 0) + 1;
    });

    // Count unique room-days used per location
    const locationUsage: Record<string, Set<string>> = {};
    transactions?.forEach((t: any) => {
        const loc = t.apartment_location;
        if (!locationUsage[loc]) locationUsage[loc] = new Set();
        // Each unique room+date combination counts as 1 room-day
        const dayKey = `${t.room_number}|${format(new Date(t.checkin_at), 'yyyy-MM-dd')}`;
        locationUsage[loc].add(dayKey);
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
