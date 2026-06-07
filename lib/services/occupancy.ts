import { format, subDays, eachDayOfInterval } from 'date-fns';
import { createServerClient } from '@/lib/supabase/server';
import { queryAnalytics } from '@/lib/analytics/db';
import {
    getOccupancyDaily as getOccupancyDailyAnalytics,
    getOccupancyRate as getOccupancyRateAnalytics,
} from '@/lib/analytics/occupancy';

// ============================================================
// lib/services/occupancy.ts
//
// Occupancy-related service functions.
//
// Both analytics DB and Supabase fallback use stay-span overlap model.
// analytics_occupancy_daily is populated by sync-worker using generate_series
// from checkin_at::date to checkout_at::date (exclusive).
// Supabase fallback uses the same checkin_at/checkout_at overlap logic.
// Results are identical for the same period and rooms.
//
// NOT MIGRATED (Supabase-only):
//   - getLiveOccupancy(): point-in-time active stay check, no analytics
//     table models real-time occupancy.
//   - getDailyCheckinVolume(): counts by checkin_at field, different
//     semantics from occupancy, irrelevant to migrate.
// ============================================================

export interface LocationOccupancyItem {
    name: string;
    totalRooms: number;
    occupiedRooms: number;
    occupancyRate: number;
}

export interface LiveOccupancyResult {
    tersedia: number;
    ditempati: number;
    total: number;
    // Standardized fields (aliases for backward compat)
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    occupancyRate: number;
    locationBreakdown: LocationOccupancyItem[];
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

type OccupancyTx = {
    room_number: string | null;
    apartment_location: string | null;
    checkin_at: string | null;
    created_at: string | null;
    checkout_at: string | null;
    rental_duration: number | string | null;
};

function calcEndAt(tx: OccupancyTx): Date {
    if (tx.checkout_at) return new Date(tx.checkout_at);

    const start = new Date(tx.checkin_at || tx.created_at || new Date());
    const hours = Number(tx.rental_duration) || 24;

    return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

function isActiveNow(tx: OccupancyTx, nowDate = new Date()): boolean {
    const start = new Date(tx.checkin_at || tx.created_at || new Date());
    const end = calcEndAt(tx);

    return nowDate >= start && nowDate < end;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Get Supabase filter for stay-span overlap logic.
 *
 * A stay "overlaps" a range [rangeStart, rangeEnd] if:
 *   check_in <= rangeEnd AND (check_out IS NULL OR check_out >= rangeStart)
 *
 * Use this for unit occupancy detail queries to ensure consistency
 * between card-level occupancy status and modal-level detail fetch.
 *
 * @example
 * const f = getStayOverlapFilter('2026-05-31T00:00:00', '2026-05-31T23:59:59');
 * // => { check_in: { lte: '2026-05-31T23:59:59' }, or: [...] }
 */
export function getStayOverlapFilter(rangeStart: string, rangeEnd: string) {
    return {
        check_in: { lte: rangeEnd },
        or: [
            { check_out: { is: null } },
            { check_out: { gte: rangeStart } },
        ],
    };
}

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
// Active stay = checkin_at <= now AND (checkout_at >= now OR checkout_at IS NULL).
//
// NOT MIGRATED TO ANALYTICS DB: No real-time occupancy table
// in analytics DB. Kept as Supabase-only.
//
// Mirrors fetchUnitStatus() in dashboard/actions.ts:42-85
// ============================================================
export async function getLiveOccupancy(): Promise<LiveOccupancyResult> {
    const supabase = createServerClient();

    try {
        // Fetch all rooms with location info in parallel with transactions
        const [{ count: totalRoomCount }, { data: allRooms }] = await Promise.all([
            supabase
                .from('nomor_kamar')
                .select('id', { count: 'exact', head: true }),
            supabase
                .from('nomor_kamar')
                .select('name, lokasi'),
        ]);

        const totalRooms = totalRoomCount || 0;

        // Ambil kandidat transaksi 3 hari terakhir + yang checkout_at null
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const { data: occupiedData, error: occError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, checkin_at, created_at, checkout_at, rental_duration')
            .or(`checkin_at.gt.${threeDaysAgo.toISOString()},checkout_at.is.null`)
            .order('checkin_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (occError) {
            console.error('Error fetching occupied rooms:', occError);
        }

        // Count unique occupied rooms globally — filter inactive on JS side
        const nowDate = new Date();
        const occupiedSet = new Set<string>();

        for (const tx of occupiedData || []) {
            if (!tx.apartment_location || !tx.room_number) continue;
            if (!isActiveNow(tx, nowDate)) continue;

            occupiedSet.add(`${tx.apartment_location}-${tx.room_number}`);
        }
        const occupiedRooms = Math.min(occupiedSet.size, totalRooms);
        const occupancyRate = totalRooms > 0
            ? Math.min(Math.round((occupiedRooms / totalRooms) * 10000) / 100, 100)
            : 0;

        // Build per-location room count
        const roomsPerLocation = new Map<string, number>();
        allRooms?.forEach((r: any) => {
            roomsPerLocation.set(r.lokasi, (roomsPerLocation.get(r.lokasi) || 0) + 1);
        });

        // Build per-location occupied count — apply same isActiveNow filter
        const occupiedPerLocation = new Map<string, Set<string>>();
        for (const tx of occupiedData || []) {
            if (!tx.apartment_location || !tx.room_number) continue;
            if (!isActiveNow(tx, nowDate)) continue;

            const loc = tx.apartment_location;
            if (!occupiedPerLocation.has(loc)) {
                occupiedPerLocation.set(loc, new Set());
            }
            occupiedPerLocation.get(loc)!.add(`${tx.apartment_location}-${tx.room_number}`);
        }

        // Build location breakdown
        const locationBreakdown: LocationOccupancyItem[] = Array.from(roomsPerLocation.entries())
            .map(([name, locTotalRooms]) => {
                const locOccupied = Math.min(occupiedPerLocation.get(name)?.size || 0, locTotalRooms);
                const locRate = locTotalRooms > 0
                    ? Math.min(Math.round((locOccupied / locTotalRooms) * 10000) / 100, 100)
                    : 0;
                return { name, totalRooms: locTotalRooms, occupiedRooms: locOccupied, occupancyRate: locRate };
            })
            .sort((a, b) => b.occupancyRate - a.occupancyRate);

        return {
            tersedia: Math.max(0, totalRooms - occupiedRooms),
            ditempati: occupiedRooms,
            total: totalRooms,
            totalRooms,
            occupiedRooms,
            availableRooms: Math.max(0, totalRooms - occupiedRooms),
            occupancyRate,
            locationBreakdown,
        };
    } catch (error) {
        console.error('Error in getLiveOccupancy:', error);
        // Return zeros instead of throwing to prevent dashboard from crashing
        return {
            tersedia: 0,
            ditempati: 0,
            total: 0,
            totalRooms: 0,
            occupiedRooms: 0,
            availableRooms: 0,
            occupancyRate: 0,
            locationBreakdown: [],
        };
    }
}

// ============================================================
// getDailyOccupancyTrend(days=30)
//
// Both analytics DB and Supabase fallback use stay-span overlap model.
// Analytics path preferred, falls back to Supabase.
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

            // Fetch total rooms from master nomor_kamar (source of truth)
            const supabase = createServerClient();
            const { count: totalRoomsRaw } = await supabase
                .from('nomor_kamar')
                .select('id', { count: 'exact', head: true });
            const totalRooms = totalRoomsRaw ?? 0;

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
            const todayKey = format(today, 'yyyy-MM-dd');
            const result: DailyOccupancyTrendPoint[] = await Promise.all(allDays.map(async (d) => {
                const dateKey = format(d, 'yyyy-MM-dd');

                // If analytics_occupancy_daily has no data for today, fallback to raw analytics mirror
                if (dateKey === todayKey && !byDate.has(dateKey)) {
                    try {
                        const dayStart = `${todayKey}T00:00:00`;
                        const dayEnd = `${todayKey}T23:59:59`;
                        const fallbackRows = await queryAnalytics<any>(`
                            SELECT DISTINCT t.room_number, t.apartment_location
                            FROM transactions t
                            WHERE (COALESCE(t.checkin_at, t.created_at) AT TIME ZONE 'Asia/Jakarta')::date = $1::date
                              AND (t.is_deleted = false OR t.is_deleted IS NULL)
                        `, [todayKey]);
                        const occupiedToday = new Set(
                            (fallbackRows || []).map((r: any) => `${r.apartment_location}-${r.room_number}`)
                        ).size;
                        const occupiedUnits = Math.min(occupiedToday, totalRooms);
                        const occupancyRate = totalRooms > 0
                            ? Math.min(Math.round((occupiedUnits / totalRooms) * 10000) / 100, 100)
                            : 0;
                        return { date: dateKey, occupancyRate, occupiedUnits, totalUnits: totalRooms };
                    } catch {
                        // fallthrough to default (0 occupancy)
                    }
                }

                const occupiedUnits = Math.min(byDate.get(dateKey)?.size || 0, totalRooms);
                const occupancyRate = totalRooms > 0
                    ? Math.min(Math.round((occupiedUnits / totalRooms) * 10000) / 100, 100)
                    : 0;
                return { date: dateKey, occupancyRate, occupiedUnits, totalUnits: totalRooms };
            }));

            return result;
        } catch (error) {
            console.warn('[occupancy] Analytics DB unavailable, falling back to Supabase:', error);
        }
    }

    // ── Supabase fallback ────────────────────────────────────
    return getDailyOccupancyTrendLegacy(days);
}

/** Supabase-only fallback (stay-span overlap model, identical definition to analytics DB). */
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
        // Stay-span overlap query — not a report period boundary.
        // Overlap: checkin ≤ rangeEnd AND (checkout ≥ rangeStart OR checkout IS NULL).
        const rangeStart = `${formattedDays[0]}T00:00:00`;
        const rangeEnd = `${formattedDays[formattedDays.length - 1]}T23:59:59`;

        const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, checkin_at, checkout_at, rental_duration, created_at')
            .lte('checkin_at', rangeEnd)
            .or(`checkout_at.gte.${rangeStart},checkout_at.is.null`);

        if (txError) {
            console.error('Error fetching transactions for occupancy:', txError);
            return [];
        }

        // Step 3: For each day, count unique occupied rooms (stay-span model)
        // Calendar-day boundaries are intentional — a room occupies a FULL calendar day regardless of report_period_mode.
        // Uses getEstimatedEnd() logic: checkout_at IS NULL is NOT "active forever" — cap at rental_duration (default 24h).
        const result: DailyOccupancyTrendPoint[] = formattedDays.map((day) => {
            const dayStart = new Date(`${day}T00:00:00`);
            const dayEndExclusive = new Date(dayStart.getTime() + 86400000);

            const occupiedOnDay = new Set<string>();

            if (transactions) {
                for (const tx of transactions) {
                    const t = tx as any;
                    const checkin = t.checkin_at as string | null;
                    const checkout = t.checkout_at as string | null;

                    // Compute effective start (checkin_at ?? created_at)
                    const stayStart = new Date(checkin || t.created_at);
                    // Compute estimated end (checkout_at ?? start + rental_duration hours, default 24h)
                    let stayEnd: Date;
                    if (checkout) {
                        stayEnd = new Date(checkout);
                    } else {
                        const hours = Number(t.rental_duration) || 24;
                        stayEnd = new Date(stayStart.getTime() + hours * 60 * 60 * 1000);
                    }

                    // Overlap: stayStart < dayEndExclusive AND stayEnd > dayStart
                    if (stayStart < dayEndExclusive && stayEnd > dayStart) {
                        occupiedOnDay.add(`${t.apartment_location}-${t.room_number}`);
                    }
                }
            }

            const occupiedUnits = Math.min(occupiedOnDay.size, totalRooms);
            const occupancyRate = totalRooms > 0
                ? Math.min(Math.round((occupiedUnits / totalRooms) * 10000) / 100, 100)
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
// Both analytics DB and Supabase fallback use stay-span overlap model.
// Analytics path preferred, falls back to Supabase.
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

/** Supabase-only fallback (stay-span overlap model, identical definition to analytics DB). */
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
    // Stay-span overlap query — not a report period boundary.
    // Overlap: checkin ≤ rangeEnd AND (checkout ≥ rangeStart OR checkout IS NULL).
    const { data: transactions } = await supabase
        .from('transactions')
        .select('room_number, apartment_location, checkin_at, checkout_at')
        .lte('checkin_at', `${endDate}T23:59:59`)
        .or(`checkout_at.gte.${startDate}T00:00:00,checkout_at.is.null`);

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
        // Use centralized boundaries. Calendar-day range since this counts
        // check-in volume per calendar day (not report-period-dependent).
        const { getDateBoundariesISO } = await import('@/lib/dashboard/periods');
        const [startISO, endISO] = await Promise.all([
            getDateBoundariesISO(startDate).then(r => r.startISO),
            getDateBoundariesISO(today).then(r => r.endISO),
        ]);

        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('checkin_at')
            .gte('checkin_at', startISO)
            .lte('checkin_at', endISO)
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

// ============================================================
// Shared helpers
// ============================================================

/**
 * Build a Supabase filter condition string for stay-span overlap with a period.
 *
 * A booking overlaps the period [periodStart, periodEnd] if:
 *   checkin_at < periodEnd AND (checkout_at > periodStart OR checkout_at IS NULL)
 *
 * This helper produces the condition string for use with .or() or .filter().
 * It is the SINGLE SOURCE OF TRUTH for stay-span overlap logic across
 * occupancy, unit availability, and related queries.
 *
 * @param periodStart ISO datetime string marking the start of the period (inclusive)
 * @param periodEnd   ISO datetime string marking the end of the period (inclusive)
 * @returns A Supabase filter condition string, e.g.:
 *          "and(checkin_at.lt.2026-06-06T23:59:59.999+07:00,or(checkout_at.gt.2026-06-06T00:00:00.000+07:00,checkout_at.is.null))"
 *
 * @example
 *   // For a day: [2026-06-06T00:00:00, 2026-06-06T23:59:59]
 *   const cond = buildOverlapCondition('2026-06-06T00:00:00.000+07:00', '2026-06-06T23:59:59.999+07:00');
 *   // Use with: .or(cond)
 */
export function buildOverlapCondition(periodStart: string, periodEnd: string): string {
    return `and(checkin_at.lt.${periodEnd},or(checkout_at.gt.${periodStart},checkout_at.is.null))`;
}

/**
 * Get the standard date columns used in booking/occupancy queries.
 * Centralized so all queries use the same field references.
 */
export function getBookingDateColumns() {
    return {
        checkin: 'checkin_at',
        checkout: 'checkout_at',
        created: 'created_at',
    } as const;
}
