'use server';

import { createServerClient } from '@/lib/supabase/server';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export interface UnitItem {
    id: number;
    name: string;
    lokasi: string;
    status: string;
    createdAt: string;
    isOccupiedToday: boolean;
    currentGuest?: string;
}

export interface LocationSummary {
    name: string;
    totalRooms: number;
    occupiedToday: number;
    availableToday: number;
    occupancyRate: number;
}

export interface UnitPageData {
    units: UnitItem[];
    locationSummaries: LocationSummary[];
    totalUnits: number;
    occupiedToday: number;
    availableToday: number;
}

/**
 * Fetch all units with their current occupancy status
 * READ ONLY - no data modification
 */
export async function fetchUnits(locationFilter?: string): Promise<UnitPageData> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

    try {
        // Fetch all rooms from nomor_kamar
        let roomQuery = supabase
            .from('nomor_kamar')
            .select('*')
            .order('lokasi')
            .order('name');

        if (locationFilter) {
            roomQuery = roomQuery.eq('lokasi', locationFilter);
        }

        const { data: rooms, error: roomError } = await roomQuery;

        if (roomError) {
            console.error('Error fetching rooms:', roomError);
            throw new Error('Failed to fetch rooms');
        }

        // Fetch today's transactions to determine which rooms are occupied
        const { data: todayTransactions, error: txError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, customer_name')
            .gte('checkin_at', `${today}T00:00:00`)
            .lt('checkin_at', `${today}T23:59:59`);

        if (txError) {
            console.error('Error fetching today transactions:', txError);
        }

        // Create a map of occupied rooms (location-room -> customer)
        const occupiedMap = new Map<string, string>();
        todayTransactions?.forEach((tx: any) => {
            const key = `${tx.apartment_location}-${tx.room_number}`;
            occupiedMap.set(key, tx.customer_name);
        });

        // Map units with occupancy info
        const units: UnitItem[] = (rooms || []).map((room: any) => {
            const key = `${room.lokasi}-${room.name}`;
            const isOccupied = occupiedMap.has(key);
            return {
                id: room.id,
                name: room.name,
                lokasi: room.lokasi,
                status: room.status,
                createdAt: room.created_at,
                isOccupiedToday: isOccupied,
                currentGuest: isOccupied ? occupiedMap.get(key) : undefined,
            };
        });

        // Calculate location summaries
        const locationMap = new Map<string, { total: number; occupied: number }>();
        units.forEach((unit) => {
            const existing = locationMap.get(unit.lokasi) || { total: 0, occupied: 0 };
            existing.total++;
            if (unit.isOccupiedToday) existing.occupied++;
            locationMap.set(unit.lokasi, existing);
        });

        const locationSummaries: LocationSummary[] = Array.from(locationMap.entries())
            .map(([name, data]) => ({
                name,
                totalRooms: data.total,
                occupiedToday: data.occupied,
                availableToday: data.total - data.occupied,
                occupancyRate: data.total > 0 ? Math.round((data.occupied / data.total) * 10000) / 100 : 0,
            }))
            .sort((a, b) => b.occupancyRate - a.occupancyRate);

        const totalUnits = units.length;
        const occupiedToday = units.filter((u) => u.isOccupiedToday).length;

        return {
            units,
            locationSummaries,
            totalUnits,
            occupiedToday,
            availableToday: totalUnits - occupiedToday,
        };
    } catch (error) {
        console.error('Error in fetchUnits:', error);
        throw new Error('Failed to fetch units');
    }
}

/**
 * Fetch all locations for filter
 * READ ONLY
 */
export async function fetchUnitLocations(): Promise<string[]> {
    const supabase = createServerClient();

    try {
        const { data, error } = await supabase
            .from('lokasi_apartemen')
            .select('name')
            .order('name');

        if (error) {
            console.error('Error fetching locations:', error);
            return [];
        }

        return (data || []).map((loc: any) => loc.name);
    } catch (error) {
        return [];
    }
}
