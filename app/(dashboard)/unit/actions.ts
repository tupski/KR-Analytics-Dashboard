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
    /** Point-in-time: room occupied right now (via getLiveOccupancy). Consistent across all filters. */
    isOccupiedToday: boolean;
    currentGuest?: string;
    /** Number of transactions overlapping the selected period. Used for period activity info, not labeled "occupancy". */
    occupancyCount?: number;
    /** True when room had ≥1 transaction overlapping the period. Only set for non-today filters. */
    hasActivityInPeriod?: boolean;
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
 *
 * KEY SEMANTICS:
 * - `isOccupiedToday`: ALWAYS point-in-time live occupancy (via getLiveOccupancy()),
 *   regardless of filter. Same as Dashboard KPI.
 * - `hasActivityInPeriod` (non-today only): room had ≥1 transaction overlapping the period.
 * - Location summaries and top-level counts: ALWAYS from getLiveOccupancy() point-in-time.
 *
 * Never label period-overlap counts as "occupancy" or "Terisi".
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

        // ── Step 1: Always get point-in-time live occupancy ──
        // Used for isOccupiedToday, location summaries, and top-level counts.
        // Consistent with Dashboard KPI regardless of filter.
        const liveOccupancyData = await getLiveOccupancy();

        // Build point-in-time occupied set from live data with customer names
        const liveOccupiedSet = new Map<string, string>(); // key → customer_name
        const { data: activeTransactions } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, customer_name')
            .lte('checkin_at', getNowWIB())
            .or(`checkout_at.gte.${getNowWIB()},checkout_at.is.null`);

        activeTransactions?.forEach((tx: any) => {
            const key = `${tx.apartment_location}-${tx.room_number}`;
            liveOccupiedSet.set(key, tx.customer_name);
        });

        // ── Step 2: Compute period activity (for hasActivityInPeriod / occupancyCount) ──
        const periodActivityMap = new Map<string, number>();

        if (dateFilter === 'today') {
            // For today, period activity = currently active transactions
            activeTransactions?.forEach((tx: any) => {
                const key = `${tx.apartment_location}-${tx.room_number}`;
                periodActivityMap.set(key, (periodActivityMap.get(key) || 0) + 1);
            });
        } else {
            // Stay-span overlap: any transaction overlapping [range.start, range.end]
            const { data: periodTx } = await supabase
                .from('transactions')
                .select('room_number, apartment_location')
                .lte('checkin_at', range.end)
                .or(`checkout_at.is.null,checkout_at.gte.${range.start}`)
                .order('checkin_at', { ascending: false });

            periodTx?.forEach((tx: any) => {
                const key = `${tx.apartment_location}-${tx.room_number}`;
                periodActivityMap.set(key, (periodActivityMap.get(key) || 0) + 1);
            });
        }

        // ── Step 3: Build units with consistent semantics ──
        const units: UnitItem[] = (rooms || []).map((room: any) => {
            const key = `${room.lokasi}-${room.name}`;
            const isOccupied = liveOccupiedSet.has(key);
            const periodCount = periodActivityMap.get(key) || 0;
            const item: UnitItem = {
                id: room.id,
                name: room.name,
                lokasi: room.lokasi,
                status: room.status,
                createdAt: room.created_at,
                isOccupiedToday: isOccupied,
                currentGuest: isOccupied ? liveOccupiedSet.get(key) : undefined,
                occupancyCount: periodCount,
            };
            // Only non-today filters get hasActivityInPeriod; today uses isOccupiedToday directly
            if (dateFilter !== 'today') {
                item.hasActivityInPeriod = periodCount > 0;
            }
            return item;
        });

        // ── Step 4: Location summaries — ALWAYS from getLiveOccupancy() (point-in-time) ──
        const locationSummaries: LocationSummary[] = liveOccupancyData.locationBreakdown
            .filter(loc => !locationFilter || loc.name === locationFilter)
            .map(loc => ({
                name: loc.name,
                totalRooms: loc.totalRooms,
                occupiedToday: loc.occupiedRooms,
                availableToday: loc.totalRooms - loc.occupiedRooms,
                occupancyRate: loc.occupancyRate,
            }))
            .sort((a, b) => b.occupancyRate - a.occupancyRate);

        // ── Step 5: Top-level counts — ALWAYS from getLiveOccupancy() (point-in-time) ──
        return {
            units,
            locationSummaries,
            totalUnits: liveOccupancyData.total,
            occupiedToday: liveOccupancyData.ditempati,
            availableToday: liveOccupancyData.tersedia,
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
