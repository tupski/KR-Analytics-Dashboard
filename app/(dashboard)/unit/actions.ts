'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getDateRange, computeDateRange } from '@/lib/services/date-range';
import type { DateFilterParams } from '@/lib/services/date-range';
import { getLocations } from '@/lib/services/location';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import {
    getLiveActiveStays,
    getLocationActiveSummaries,
    getTodayCheckins,
    buildRoomKey,
    getEffectiveStart,
    getEstimatedEnd,
} from '@/lib/services/stays';
import type { LocationActiveSummary } from '@/lib/services/stays';

export type UnitDateFilter = 'today' | 'yesterday' | '7days' | 'month' | 'year';

export interface UnitItem {
    id: number;
    name: string;
    lokasi: string;
    status: string;
    createdAt: string;
    /** Point-in-time: room occupied right now (via getLiveActiveStays). Consistent across all filters. */
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
 * - `isOccupiedToday`: ALWAYS point-in-time live occupancy (via getLiveActiveStays()),
 *   regardless of filter. Same as Dashboard KPI.
 * - `hasActivityInPeriod` (non-today only): room had ≥1 transaction overlapping the period.
 * - Location summaries and top-level counts: ALWAYS from getLocationActiveSummaries() point-in-time.
 *
 * Never label period-overlap counts as "occupancy" or "Terisi".
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

        // ── Step 1: Get canonical active stays (point-in-time) AND today check-ins ──
        const [activeStays, todayCheckins] = await Promise.all([
            getLiveActiveStays({ supabase }),
            getTodayCheckins({ supabase }),
        ]);

        // Deduplicate by room — keep first (latest, since stays are sorted descending)
        // Include both active stays AND today check-ins
        const latestPerRoom = new Map<string, string>(); // roomKey → customerName
        const todayCheckinRooms = new Set<string>(); // rooms with booking/checkin today

        for (const stay of activeStays) {
            const key = buildRoomKey(stay.location, stay.roomNumber);
            if (!latestPerRoom.has(key)) {
                latestPerRoom.set(key, stay.customerName ?? '-');
            }
        }

        // Mark rooms with today check-ins (not yet active but booked today)
        for (const tx of todayCheckins) {
            const key = buildRoomKey(tx.apartment_location, tx.room_number);
            todayCheckinRooms.add(key);
            // Only set guest name if not already set by active stay
            if (!latestPerRoom.has(key)) {
                latestPerRoom.set(key, tx.customer_name ?? '-');
            }
        }

        // ── Step 2: Get location summaries from canonical source ──
        const summaries = await getLocationActiveSummaries({ supabase });

        // Development debug logging
        if (process.env.NODE_ENV === 'development') {
            console.debug('[Unit] Location summaries:', JSON.stringify(summaries, null, 2));
            console.debug('[Unit] Active stays:', JSON.stringify(activeStays, null, 2));
            console.debug('[Unit] Today check-ins:', JSON.stringify(
                todayCheckins.map(tx => ({
                    id: tx.id,
                    customer_name: tx.customer_name,
                    location: tx.apartment_location,
                    room_number: tx.room_number,
                    checkin_at: tx.checkin_at,
                    created_at: tx.created_at,
                })),
                null, 2
            ));
            console.debug('[Unit] Today checkin rooms:', [...todayCheckinRooms]);
            console.debug('[Unit] latestPerRoom count:', latestPerRoom.size);

            const bintaroSummary = summaries.find(s => s.location.includes('Bintaro'));
            if (bintaroSummary) {
                console.debug('[Unit Debug] Transpark Bintaro:', bintaroSummary);
                console.debug(
                    '[Unit Debug] Active stays for Bintaro:',
                    activeStays.filter(s => s.location.includes('Bintaro')),
                );
                console.debug(
                    '[Unit Debug] Today check-ins for Bintaro:',
                    todayCheckins.filter(tx => tx.apartment_location?.includes('Bintaro')),
                );
            }
        }

        // ── Step 3: Compute period activity (for hasActivityInPeriod / occupancyCount) ──
        const periodActivityMap = new Map<string, number>();

        if (dateFilter === 'today') {
            // For today, period activity = currently active transactions
            for (const stay of activeStays) {
                const key = buildRoomKey(stay.location, stay.roomNumber);
                periodActivityMap.set(key, (periodActivityMap.get(key) || 0) + 1);
            }
        } else {
            // Stay-span overlap: any transaction overlapping [range.start, range.end]
            const { data: periodTx } = await supabase
                .from('transactions')
                .select('room_number, apartment_location')
                .lte('checkin_at', range.end)
                .or(`checkout_at.is.null,checkout_at.gte.${range.start}`)
                .order('checkin_at', { ascending: false });

            periodTx?.forEach((tx: any) => {
                const key = buildRoomKey(tx.apartment_location, tx.room_number);
                periodActivityMap.set(key, (periodActivityMap.get(key) || 0) + 1);
            });
        }

        // ── Step 4: Build units with consistent semantics ──
        const units: UnitItem[] = (rooms || []).map((room: any) => {
            const key = buildRoomKey(room.lokasi, room.name);
            const isOccupied = latestPerRoom.has(key);
            const periodCount = periodActivityMap.get(key) || 0;
            const item: UnitItem = {
                id: room.id,
                name: room.name,
                lokasi: room.lokasi,
                status: room.status,
                createdAt: room.created_at,
                isOccupiedToday: isOccupied,
                currentGuest: isOccupied ? latestPerRoom.get(key) : undefined,
                occupancyCount: periodCount,
            };
            // Only non-today filters get hasActivityInPeriod; today uses isOccupiedToday directly
            if (dateFilter !== 'today') {
                item.hasActivityInPeriod = periodCount > 0;
            }
            return item;
        });

        // ── Step 5: Location summaries — from canonical getLocationActiveSummaries() ──
        const locationSummaries: LocationSummary[] = summaries
            .filter(loc => !locationFilter || loc.location === locationFilter)
            .map(loc => ({
                name: loc.location,
                totalRooms: loc.totalRooms,
                occupiedToday: loc.occupiedRooms,
                availableToday: loc.availableRooms,
                occupancyRate: loc.occupancyRate,
            }))
            .sort((a, b) => b.occupancyRate - a.occupancyRate);

        // ── Step 6: Top-level counts — merge canonical summaries with today check-ins ──
        const totalUnits = summaries.reduce((sum, s) => sum + s.totalRooms, 0);
        
        // Count rooms that are EITHER live-active OR have a today check-in
        const occupiedRoomKeys = new Set<string>();
        // From canonical summaries (live active stays)
        for (const stay of activeStays) {
            occupiedRoomKeys.add(buildRoomKey(stay.location, stay.roomNumber));
        }
        // From today check-ins (bookings/check-ins today, may not be active yet)
        for (const tx of todayCheckins) {
            occupiedRoomKeys.add(buildRoomKey(tx.apartment_location, tx.room_number));
        }
        
        const occupiedToday = occupiedRoomKeys.size;
        const availableToday = totalUnits - occupiedToday;

        return {
            units,
            locationSummaries,
            totalUnits,
            occupiedToday,
            availableToday,
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

// ─────────────────────────────────────────────────────────────────
// C5: Fetch room details for occupied units — filter-period guests only
// ─────────────────────────────────────────────────────────────────

export interface UnitRoomDetail {
    id: string | number;
    created_at: string;
    checkin_at: string | null;
    checkout_at: string | null;
    rental_duration: number | null;
    customer_name: string | null;
    apartment_location: string;
    room_number: string;
    status?: string | null;
}

export async function fetchUnitRoomDetails(params: {
    location: string;
    room: string;
    periodStart?: string;
    periodEnd?: string;
    mode: 'active_or_period';
    page?: number;
    pageSize?: number;
}): Promise<{ data: UnitRoomDetail[]; total: number }> {
    const supabase = await createServerClient();

    const { location, room, periodStart, periodEnd, page = 1, pageSize = 10 } = params;

    let query = supabase
        .from('transactions')
        .select('id, created_at, checkin_at, checkout_at, rental_duration, customer_name, status, apartment_location, room_number')
        .eq('apartment_location', location)
        .eq('room_number', room);

    // If period provided, get overlapping stays using canonical helpers
    if (periodStart && periodEnd) {
        // Fetch all transactions for this room (with reasonable limit)
        const { data, error } = await query
            .gte('created_at', periodStart) // lookback
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // JS filter by overlap using canonical helpers
        const filtered = (data ?? []).filter(tx => {
            const start = getEffectiveStart(tx as any);
            const end = getEstimatedEnd(tx as any);
            const pStart = new Date(periodStart);
            const pEnd = new Date(periodEnd);
            return start < pEnd && end > pStart;
        });

        return { data: filtered as UnitRoomDetail[], total: filtered.length };
    }

    // Otherwise just return recent transactions
    const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(pageSize);

    if (error) throw error;
    return { data: (data ?? []) as UnitRoomDetail[], total: (data ?? []).length };
}

// ─────────────────────────────────────────────────────────────────
// C6: Fetch last check-ins for empty units with pagination (5 per page)
// ─────────────────────────────────────────────────────────────────

export interface UnitLastCheckin {
    id: string | number;
    created_at: string;
    checkin_at: string | null;
    checkout_at: string | null;
    rental_duration: number | null;
    customer_name: string | null;
    status?: string | null;
}

export async function fetchUnitLastCheckins(params: {
    location: string;
    room: string;
    page?: number;
    pageSize?: number;
}): Promise<{
    data: UnitLastCheckin[];
    total: number;
    page: number;
    pageSize: number;
    hasNext: boolean;
}> {
    const supabase = await createServerClient();
    const { location, room, page = 1, pageSize = 5 } = params;

    // Fetch up to 100 candidates for proper sorting
    const { data, error, count } = await supabase
        .from('transactions')
        .select('id, created_at, checkin_at, checkout_at, rental_duration, customer_name, status', { count: 'exact' })
        .eq('apartment_location', location)
        .eq('room_number', room)
        .order('created_at', { ascending: false })
        .limit(100); // Fetch enough to sort properly

    if (error) throw error;

    // Sort ALL candidates by effective date descending
    const sorted = ((data ?? []) as UnitLastCheckin[]).sort((a: any, b: any) => {
        const dateA = new Date(a.checkin_at || a.created_at).getTime();
        const dateB = new Date(b.checkin_at || b.created_at).getTime();
        return dateB - dateA;
    });

    // Now paginate the sorted result
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const pageItems = sorted.slice(from, to);

    const total = count ?? sorted.length;

    return {
        data: pageItems,
        total,
        page,
        pageSize,
        hasNext: to < total,
    };
}
