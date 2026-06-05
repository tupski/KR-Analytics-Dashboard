'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getDateRange, computeDateRange } from '@/lib/services/date-range';
import type { DateFilterParams } from '@/lib/services/date-range';
import { getLocations } from '@/lib/services/location';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import { getNowWIB } from '@/lib/utils/format';
import { getLiveOccupancy } from '@/lib/services/occupancy';
import type { LiveOccupancyResult, LocationOccupancyItem } from '@/lib/services/occupancy';

export type UnitDateFilter = 'today' | 'yesterday' | '7days' | 'month' | 'year';

export interface UnitItem {
    id: number;
    name: string;
    lokasi: string;
    status: string;
    createdAt: string;
    isOccupiedToday: boolean;
    currentGuest?: string;
    occupancyCount?: number; // number of transactions in selected period
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
 * Fetch all units with their occupancy status for a given period.
 * - When filter = 'today': occupied = active right now (uses centralized getLiveOccupancy()).
 * - Other filters: occupied = had any transaction in the period.
 *
 * Uses centralized getLiveOccupancy() for "today" occupancy counts and
 * location breakdowns — ensures Dashboard KPI cards and Unit page
 * compute the same live occupancy rate.
 *
 * Accepts either legacy dateFilter (today/yesterday/7days/month/year) or
 * unified DateFilterParams (rangePreset, startDate, endDate).
 */
export async function fetchUnits(
    locationFilter?: string,
    dateFilter: UnitDateFilter = 'today',
    dateParams?: DateFilterParams,
): Promise<UnitPageData & { dateLabel: string }> {
    const supabase = createServerClient();

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

        // Use unified date params if provided, else fall back to legacy dateFilter
        const mode = await getReportPeriodSetting();
        const range = dateParams?.rangePreset
            ? computeDateRange(dateParams.rangePreset, dateParams.startDate, dateParams.endDate, mode)
            : getDateRange(dateFilter, mode);

        // For "today" filter, occupancy = active right now (centralized function)
        // For other filters, occupancy = had at least one transaction in period
        const occupiedMap = new Map<string, string>();
        const occupancyCountMap = new Map<string, number>();

        // Get centralized live occupancy for "today" filter
        let liveOccupancyData = null;

        if (dateFilter === 'today') {
            // Call centralized function for counts + location breakdown
            liveOccupancyData = await getLiveOccupancy();

            // Still need room-level detail (customer names) for individual unit display
            const { data: activeTransactions } = await supabase
                .from('transactions')
                .select('room_number, apartment_location, customer_name')
                .lte('checkin_at', getNowWIB())
                .or(`checkout_at.gte.${getNowWIB()},checkout_at.is.null`);

            activeTransactions?.forEach((tx: any) => {
                const key = `${tx.apartment_location}-${tx.room_number}`;
                occupiedMap.set(key, tx.customer_name);
                occupancyCountMap.set(key, (occupancyCountMap.get(key) || 0) + 1);
            });
        } else {
            // Use stay-span overlap logic: any stay that overlaps [range.start, range.end]
            // matches as "occupied" — same logic as fetchRoomDetails and fetchUnits('today')
            const { data: periodTx } = await supabase
                .from('transactions')
                .select('room_number, apartment_location, customer_name, checkin_at')
                .lte('checkin_at', range.end)
                .or(`checkout_at.is.null,checkout_at.gte.${range.start}`)
                .order('checkin_at', { ascending: false });

            periodTx?.forEach((tx: any) => {
                const key = `${tx.apartment_location}-${tx.room_number}`;
                if (!occupiedMap.has(key)) occupiedMap.set(key, tx.customer_name);
                occupancyCountMap.set(key, (occupancyCountMap.get(key) || 0) + 1);
            });
        }

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
                occupancyCount: occupancyCountMap.get(key) || 0,
            };
        });

        // Location summaries: use centralized getLiveOccupancy() for "today" filter
        // to ensure Dashboard + Unit page show identical location occupancy rates.
        // For non-today filters, derive from room data as before.
        let locationSummaries: LocationSummary[];

        if (dateFilter === 'today' && liveOccupancyData) {
            locationSummaries = liveOccupancyData.locationBreakdown
                .filter(loc => !locationFilter || loc.name === locationFilter)
                .map(loc => ({
                    name: loc.name,
                    totalRooms: loc.totalRooms,
                    occupiedToday: loc.occupiedRooms,
                    availableToday: loc.totalRooms - loc.occupiedRooms,
                    occupancyRate: loc.occupancyRate,
                }))
                .sort((a, b) => b.occupancyRate - a.occupancyRate);
        } else {
            // Derive from room-level data for non-today filters
            const locationMap = new Map<string, { total: number; occupied: number }>();
            units.forEach((unit) => {
                const existing = locationMap.get(unit.lokasi) || { total: 0, occupied: 0 };
                existing.total++;
                if (unit.isOccupiedToday) existing.occupied++;
                locationMap.set(unit.lokasi, existing);
            });

            locationSummaries = Array.from(locationMap.entries())
                .map(([name, data]) => ({
                    name,
                    totalRooms: data.total,
                    occupiedToday: data.occupied,
                    availableToday: data.total - data.occupied,
                    occupancyRate: data.total > 0 ? Math.round((data.occupied / data.total) * 10000) / 100 : 0,
                }))
                .sort((a, b) => b.occupancyRate - a.occupancyRate);
        }

        // Use centralized counts for "today" filter, else derive from units
        const totalUnits = units.length;
        const occupiedToday = dateFilter === 'today' && liveOccupancyData
            ? liveOccupancyData.ditempati
            : units.filter((u) => u.isOccupiedToday).length;

        return {
            units,
            locationSummaries,
            totalUnits: liveOccupancyData?.total ?? totalUnits,
            occupiedToday,
            availableToday: dateFilter === 'today' && liveOccupancyData
                ? liveOccupancyData.tersedia
                : totalUnits - occupiedToday,
            dateLabel: range.label,
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
    const locations = await getLocations();
    return locations.map(loc => loc.name);
}
