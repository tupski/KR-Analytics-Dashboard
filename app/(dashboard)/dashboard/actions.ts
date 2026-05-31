'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getTodayReportRange } from '@/lib/get-report-period-setting';
import { getReportPeriodRange } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';
import { getLiveOccupancy, getDailyOccupancyTrend } from '@/lib/services/occupancy';
import { getRevenueTrend } from '@/lib/services/revenue';
import { getLocations } from '@/lib/services/location';
import { applyLocationHealthStatuses } from '@/lib/dashboard/location-health';
import { getIdleSeverity } from '@/lib/dashboard/unit-performance';
import type { LocationHealthItem, IdleUnitItem, UnitPerformanceItem, MarketingPerformanceItem, MarketingPerformanceStatus } from '@/types/dashboard';
import { normalizeMarketingName, getMarketingStatus } from '@/lib/dashboard/marketing-performance';
import type { UnitPerformanceData } from '@/lib/dashboard/unit-performance';
import { format, subDays, subWeeks, subMonths, subYears, startOfWeek, startOfMonth, startOfYear, parse } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { computeDateRange, computeComparisonRange } from '@/lib/services/date-range';
import type { DateFilterParams } from '@/lib/services/date-range';
import type {
    UnitStatusCounts,
    CheckinItem,
    CheckoutItem,
    KPIData,
    KPICompareMode,
    RevenueDataPoint,
    RevenueFilter,
    OccupancyDataPoint
} from '@/types/dashboard';

/**
 * Fetches unit status summary via the occupancy service.
 *
 * @returns Promise<UnitStatusCounts> Object containing counts for each unit status
 */
export async function fetchUnitStatus(): Promise<UnitStatusCounts> {
    const result = await getLiveOccupancy();
    return {
        tersedia: result.tersedia,
        ditempati: result.ditempati,
    };
}

/**
 * Fetch today's check-ins
 * 
 * Queries transactions with checkin_at = today, sorted by time ascending.
 * Returns up to 5 check-in items with formatted time in HH:mm format.
 * 
 * @returns Array of check-in items for today, limited to 5 items
 * @throws Error if data fetching fails
 * 
 */
export async function fetchTodayCheckins(): Promise<CheckinItem[]> {
    const supabase = createServerClient();
    const { start, end } = await getTodayReportRange();

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('id, apartment_location, room_number, customer_name, checkin_at')
            .gte('checkin_at', start)
            .lte('checkin_at', end)
            .order('checkin_at', { ascending: true })
            .limit(5);

        if (error) {
            console.error('Error fetching check-ins:', error);
            throw new Error(`Gagal mengambil data check-in: ${error.message}`);
        }

        if (!data) return [];

        return data.map((item: {
            id: string;
            apartment_location: string;
            room_number: string;
            customer_name: string;
            checkin_at: string;
        }) => ({
            id: item.id,
            apartmentLocation: item.apartment_location,
            roomNumber: item.room_number,
            customerName: item.customer_name,
            time: format(new Date(item.checkin_at), 'HH:mm'),
            checkinAt: new Date(item.checkin_at)
        }));
    } catch (error) {
        console.error('Error in fetchTodayCheckins:', error);
        throw new Error('Gagal mengambil data check-in');
    }
}

/**
 * Fetch today's check-outs
 * 
 * Queries transactions with checkout_at = today, sorted by time descending.
 * Returns up to 5 check-out items with formatted time in HH:mm format.
 * 
 * @returns Array of check-out items for today, limited to 5 items
 * @throws Error if data fetching fails
 * 
 */
export async function fetchTodayCheckouts(): Promise<CheckoutItem[]> {
    const supabase = createServerClient();
    const { start, end } = await getTodayReportRange();

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('id, apartment_location, room_number, customer_name, checkout_at')
            .gte('checkout_at', start)
            .lte('checkout_at', end)
            .order('checkout_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Error fetching check-outs:', error);
            throw new Error(`Gagal mengambil data check-out: ${error.message}`);
        }

        if (!data) return [];

        return data.map((item: {
            id: string;
            apartment_location: string;
            room_number: string;
            customer_name: string;
            checkout_at: string;
        }) => ({
            id: item.id,
            apartmentLocation: item.apartment_location,
            roomNumber: item.room_number,
            customerName: item.customer_name,
            time: format(new Date(item.checkout_at), 'HH:mm'),
            checkoutAt: new Date(item.checkout_at)
        }));
    } catch (error) {
        console.error('Error in fetchTodayCheckouts:', error);
        throw new Error('Gagal mengambil data check-out');
    }
}

/**
 * Compute KPI snapshot for a specific day.
 * - bookingCount: # transactions with checkin on that day
 * - revenue: sum of cash + transfer for those transactions
 * - distinctRoomsOccupied: # unique rooms used that day (proxy for end-of-day occupancy)
 *
 * Uses getReportPeriodRange() to respect report_period_mode (calendar_day or hotel_day)
 * so comparison periods match the same boundaries as today's KPI.
 */
async function fetchDailyKPISnapshot(
    supabase: ReturnType<typeof createServerClient>,
    targetDay: string,
    totalRoomsCount: number,
    mode?: ReportPeriodMode,
): Promise<{ bookingCount: number; revenue: number; distinctRoomsOccupied: number; avgOccupancy: number; availableUnits: number }> {
    // Use period-aware boundaries (calendar_day or hotel_day) when mode provided
    const range = mode
        ? getReportPeriodRange(targetDay, mode)
        : getReportPeriodRange(targetDay, 'calendar_day');
    const dayStart = range.start;
    const dayEnd = range.end;

    const [{ count: bookingCount }, { data: txData }] = await Promise.all([
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .gte('checkin_at', dayStart)
            .lte('checkin_at', dayEnd),
        supabase
            .from('transactions')
            .select('cash_amount, transfer_amount, room_number, apartment_location')
            .gte('checkin_at', dayStart)
            .lte('checkin_at', dayEnd),
    ]);

    const revenue = txData?.reduce(
        (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0),
        0,
    ) || 0;

    const distinctRoomsOccupied = new Set(
        (txData || []).map((t: any) => `${t.apartment_location}-${t.room_number}`),
    ).size;

    const avgOccupancy = totalRoomsCount > 0
        ? Math.round((distinctRoomsOccupied / totalRoomsCount) * 10000) / 100
        : 0;

    return {
        bookingCount: bookingCount || 0,
        revenue,
        distinctRoomsOccupied,
        avgOccupancy,
        availableUnits: Math.max(0, totalRoomsCount - distinctRoomsOccupied),
    };
}

function getCompareDay(todayStr: string, mode: KPICompareMode): { day: string; label: string } {
    const today = new Date(todayStr + 'T00:00:00');
    switch (mode) {
        case 'yesterday':
            return { day: format(subDays(today, 1), 'yyyy-MM-dd'), label: 'Kemarin' };
        case 'lastweek':
            return { day: format(subDays(today, 7), 'yyyy-MM-dd'), label: 'Minggu Lalu (hari sama)' };
        case 'lastmonth':
            return { day: format(subDays(today, 30), 'yyyy-MM-dd'), label: 'Bulan Lalu (hari sama)' };
        case 'lastyear':
            return { day: format(subYears(today, 1), 'yyyy-MM-dd'), label: 'Tahun Lalu (hari sama)' };
    }
}

function pctChange(curr: number, prev: number): number | null {
    if (prev === 0) return curr === 0 ? 0 : null;
    return Math.round(((curr - prev) / prev) * 10000) / 100;
}

/**
 * Fetch KPI data for dashboard cards
 *
 * Fetches: booking count, revenue, average occupancy, available units.
 * Uses Asia/Jakarta timezone for date calculations.
 *
 * Accepts compareMode (legacy single-day) OR dateParams (new unified date filter params).
 * When dateParams are provided, compareMode is ignored for date range but comparison
 * mode from dateParams takes precedence.
 *
 */
export async function fetchKPIData(
    compareMode?: KPICompareMode,
    dateParams?: DateFilterParams,
): Promise<KPIData> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');
    const { getReportPeriodSetting } = await import('@/lib/get-report-period-setting');
    const mode = await getReportPeriodSetting();

    try {
        // Total rooms (used for occupancy denominator across snapshots)
        const { count: totalRooms } = await supabase
            .from('nomor_kamar')
            .select('id', { count: 'exact', head: true });
        const totalRoomsCount = totalRooms || 0;

        // Compute main date range from dateParams or fall back to today
        const range = dateParams?.rangePreset
            ? computeDateRange(dateParams.rangePreset, dateParams.startDate, dateParams.endDate, mode)
            : null;
        const actualDayStart = range?.start || (await getTodayReportRange()).start;
        const actualDayEnd = range?.end || (await getTodayReportRange()).end;

        const { count: bookingCount } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .gte('checkin_at', actualDayStart)
            .lte('checkin_at', actualDayEnd);

        const { data: revenueData } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', actualDayStart)
            .lte('checkin_at', actualDayEnd);

        const periodRevenue = revenueData?.reduce(
            (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0),
            0,
        ) || 0;

        // Occupancy & available — point-in-time (currently active)
        const nowIso = new Date().toISOString();
        let currentlyOccupiedCount = 0;
        let avgOccupancy = 0;
        if (totalRoomsCount > 0) {
            const { data: occData } = await supabase
                .from('transactions')
                .select('room_number, apartment_location')
                .lte('checkin_at', nowIso)
                .gte('checkout_at', nowIso);
            currentlyOccupiedCount = new Set(
                (occData || []).map((t: any) => `${t.apartment_location}-${t.room_number}`),
            ).size;
            avgOccupancy = Math.round((currentlyOccupiedCount / totalRoomsCount) * 10000) / 100;
        }
        const availableUnits = Math.max(0, totalRoomsCount - currentlyOccupiedCount);

        const result: KPIData = {
            bookingToday: bookingCount || 0,
            revenueToday: periodRevenue,
            avgOccupancy,
            availableUnits,
        };

        // Compute comparison range from dateParams or legacy compareMode
        let compRange: { start: string; end: string; label: string } | null = null;

        if (dateParams?.comparisonMode && dateParams.comparisonMode !== 'none') {
            const cr = computeComparisonRange(
                dateParams.comparisonMode,
                actualDayStart,
                actualDayEnd,
                dateParams.comparisonStartDate,
                dateParams.comparisonEndDate,
                mode,
            );
            if (cr) compRange = cr;
        } else if (compareMode) {
            const { day: prevDay, label: prevLabel } = getCompareDay(today, compareMode);
            const snap = getReportPeriodRange(prevDay, mode);
            compRange = { start: snap.start, end: snap.end, label: prevLabel };
        }

        if (compRange) {
            const { count: prevBookingCount } = await supabase
                .from('transactions')
                .select('*', { count: 'exact', head: true })
                .gte('checkin_at', compRange.start)
                .lte('checkin_at', compRange.end);

            const { data: prevRevenueData } = await supabase
                .from('transactions')
                .select('cash_amount, transfer_amount')
                .gte('checkin_at', compRange.start)
                .lte('checkin_at', compRange.end);

            const prevRevenue = prevRevenueData?.reduce(
                (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0),
                0,
            ) || 0;

            result.prev = {
                booking: prevBookingCount || 0,
                revenue: prevRevenue,
                avgOccupancy: 0,
                availableUnits: 0,
                label: compRange.label || 'Periode sebelumnya',
                mode: compareMode || 'yesterday',
            };
            result.change = {
                bookingChangePct: pctChange(result.bookingToday, prevBookingCount || 0),
                revenueChangePct: pctChange(result.revenueToday, prevRevenue),
                occupancyChangePct: null,
                availableChangePct: null,
            };
        }

        return result;
    } catch (error) {
        console.error('Error in fetchKPIData:', error);
        throw new Error('Failed to fetch KPI data');
    }
}

/**
 * Aggregate revenue data based on filter type
 * 
 * @param data Raw daily revenue data from RPC
 * @param filter Time period filter
 * @returns Aggregated revenue data points with formatted labels
 */
function aggregateRevenueData(
    data: any[],
    filter: RevenueFilter
): RevenueDataPoint[] {
    if (!data || data.length === 0) return [];

    switch (filter) {
        case 'daily':
            // Return daily data sorted from oldest to newest
            return data.map((item) => ({
                date: item.transaction_date,
                revenue: item.total_revenue || 0,
                transactionCount: item.transaction_count || 0,
                label: format(new Date(item.transaction_date), 'dd MMM', { locale: idLocale }),
            })).sort((a, b) => a.date.localeCompare(b.date));

        case 'weekly': {
            // Group by week
            const weeklyData = new Map<string, { revenue: number; count: number }>();

            data.forEach((item) => {
                const date = new Date(item.transaction_date);
                const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
                const weekKey = format(weekStart, 'yyyy-MM-dd');

                const existing = weeklyData.get(weekKey) || { revenue: 0, count: 0 };
                weeklyData.set(weekKey, {
                    revenue: existing.revenue + (item.total_revenue || 0),
                    count: existing.count + (item.transaction_count || 0),
                });
            });

            return Array.from(weeklyData.entries())
                .map(([date, data]) => ({
                    date,
                    revenue: data.revenue,
                    transactionCount: data.count,
                    label: `Minggu ${format(new Date(date), 'dd MMM')}`,
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        case 'monthly': {
            // Group by month
            const monthlyData = new Map<string, { revenue: number; count: number }>();

            data.forEach((item) => {
                const date = new Date(item.transaction_date);
                const monthStart = startOfMonth(date);
                const monthKey = format(monthStart, 'yyyy-MM');

                const existing = monthlyData.get(monthKey) || { revenue: 0, count: 0 };
                monthlyData.set(monthKey, {
                    revenue: existing.revenue + (item.total_revenue || 0),
                    count: existing.count + (item.transaction_count || 0),
                });
            });

            return Array.from(monthlyData.entries())
                .map(([date, data]) => ({
                    date,
                    revenue: data.revenue,
                    transactionCount: data.count,
                    label: format(new Date(date + '-01'), 'MMM yyyy', { locale: idLocale }),
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        case 'yearly': {
            // Group by year
            const yearlyData = new Map<string, { revenue: number; count: number }>();

            data.forEach((item) => {
                const date = new Date(item.transaction_date);
                const yearStart = startOfYear(date);
                const yearKey = format(yearStart, 'yyyy');

                const existing = yearlyData.get(yearKey) || { revenue: 0, count: 0 };
                yearlyData.set(yearKey, {
                    revenue: existing.revenue + (item.total_revenue || 0),
                    count: existing.count + (item.transaction_count || 0),
                });
            });

            return Array.from(yearlyData.entries())
                .map(([date, data]) => ({
                    date,
                    revenue: data.revenue,
                    transactionCount: data.count,
                    label: date,
                }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        default:
            return [];
    }
}

/** Legacy Supabase-only implementation (kept as fallback). */
async function fetchRevenueDataLegacy(filter: RevenueFilter): Promise<RevenueDataPoint[]> {
    const supabase = createServerClient();
    const today = new Date();
    let startDate: Date;

    switch (filter) {
        case 'daily':
            startDate = subDays(today, 30);
            break;
        case 'weekly':
            startDate = subWeeks(today, 12);
            break;
        case 'monthly':
            startDate = subMonths(today, 12);
            break;
        case 'yearly':
            startDate = subYears(today, 5);
            break;
        default:
            startDate = subDays(today, 30);
    }

    try {
        const { data, error } = await supabase.rpc('get_daily_revenue_trend', {
            p_start_date: format(startDate, 'yyyy-MM-dd'),
            p_end_date: format(today, 'yyyy-MM-dd'),
            p_location: null,
            p_limit: 1000,
            p_offset: 0
        });

        if (error) {
            console.error('Error fetching revenue data:', error);
            throw new Error(`Failed to fetch revenue data: ${error.message}`);
        }

        if (!data) {
            return [];
        }

        return aggregateRevenueData(data, filter);
    } catch (error) {
        console.error('Error in fetchRevenueDataLegacy:', error);
        throw new Error('Failed to fetch revenue data');
    }
}

/**
 * Fetch revenue trend data based on selected time filter.
 *
 * Migrated (Phase 2B-5D): calls getRevenueTrend() from revenue service
 * (analytics DB first, Supabase RPC fallback). Return shape is IDENTICAL
 * to the legacy version so no component changes needed.
 *
 * @param filter Time period filter: 'daily' | 'weekly' | 'monthly' | 'yearly'
 * @returns Promise<RevenueDataPoint[]> Array of revenue data points
 */
export async function fetchRevenueData(filter: RevenueFilter): Promise<RevenueDataPoint[]> {
    const today = new Date();
    let startDate: Date;

    switch (filter) {
        case 'daily':
            startDate = subDays(today, 30);
            break;
        case 'weekly':
            startDate = subWeeks(today, 12);
            break;
        case 'monthly':
            startDate = subMonths(today, 12);
            break;
        case 'yearly':
            startDate = subYears(today, 5);
            break;
        default:
            startDate = subDays(today, 30);
    }

    try {
        const trendPoints = await getRevenueTrend(
            format(startDate, 'yyyy-MM-dd'),
            format(today, 'yyyy-MM-dd'),
        );

        if (!trendPoints || trendPoints.length === 0) {
            return [];
        }

        // Map getRevenueTrend() output {date, revenue, transactionCount}
        // to aggregateRevenueData() expected shape {transaction_date, total_revenue, transaction_count}
        const mapped = trendPoints.map((p) => ({
            transaction_date: p.date,
            total_revenue: p.revenue,
            transaction_count: p.transactionCount,
        }));

        return aggregateRevenueData(mapped, filter);
    } catch (error) {
        console.warn('[dashboard] Revenue service unavailable, falling back to legacy:', error);
    }

    return fetchRevenueDataLegacy(filter);
}

/**
 * Fetch occupancy rate data for specified period.
 *
 * Delegates to the corrected getDailyOccupancyTrend() which computes
 * TRUE daily occupancy: a room is occupied on a day if any transaction
 * has checkin_at <= end of that day AND checkout_at >= start of that day.
 * (Multi-day stays count on every day, not just check-in day.)
 *
 * @param days Number of days to fetch (default 30)
 * @returns Promise<OccupancyDataPoint[]> Array of occupancy data points
 *
 */
export async function fetchOccupancyData(days: number = 30): Promise<OccupancyDataPoint[]> {
    return getDailyOccupancyTrend(days);
}

/**
 * Fetch sync freshness status from the analytics DB.
 * Returns normalized SyncFreshnessResult — never throws.
 */
export async function getSyncFreshness(): Promise<import('@/lib/analytics/sync-freshness').SyncFreshnessResult> {
    const { getSyncFreshnessResult } = await import('@/lib/analytics/sync-freshness');
    try {
        return await getSyncFreshnessResult();
    } catch {
        return {
            status: 'unavailable' as const,
            lastSyncAt: null,
            lastSyncAtWIB: null,
            rowsSyncedLastRun: null,
            errorMessage: 'Gagal mengambil status sinkronisasi',
        };
    }
}

/**
 * Fetch per-location health matrix for the current report period.
 *
 * Returns location health items with: total units, occupied units (active stay),
 * occupancy rate, revenue, revenue per unit, and computed health status.
 *
 * Uses `getTodayReportRange()` to respect report_period_mode.
 * Occupancy uses the same stay-span overlap model as getLiveOccupancy():
 *   checkin_at ≤ now AND checkout_at ≥ now.
 * Revenue sums cash_amount + transfer_amount for bookings with checkin_at
 * within the report period.
 */
export async function fetchLocationHealthData(): Promise<LocationHealthItem[]> {
    const supabase = createServerClient();
    const { start: periodStart, end: periodEnd } = await getTodayReportRange();
    const nowIso = new Date().toISOString();

    try {
        // 1. Get all locations with room counts
        const locations = await getLocations();
        if (locations.length === 0) return [];

        // 2. Get all rooms per location for mapping
        const { data: allRooms } = await supabase
            .from('nomor_kamar')
            .select('name, lokasi');

        const roomsPerLocation: Record<string, number> = {};
        allRooms?.forEach((r: any) => {
            roomsPerLocation[r.lokasi] = (roomsPerLocation[r.lokasi] || 0) + 1;
        });

        // 3. Get active stays (occupancy) per location — stay-span overlap
        const { data: activeStays } = await supabase
            .from('transactions')
            .select('room_number, apartment_location')
            .lte('checkin_at', nowIso)
            .gte('checkout_at', nowIso);

        const occupiedPerLocation: Record<string, Set<string>> = {};
        activeStays?.forEach((t: any) => {
            const loc = t.apartment_location;
            if (!occupiedPerLocation[loc]) occupiedPerLocation[loc] = new Set();
            occupiedPerLocation[loc].add(`${t.apartment_location}-${t.room_number}`);
        });

        // 4. Get revenue per location within the report period
        const { data: revenueData } = await supabase
            .from('transactions')
            .select('apartment_location, cash_amount, transfer_amount')
            .gte('checkin_at', periodStart)
            .lte('checkin_at', periodEnd);

        const revenuePerLocation: Record<string, number> = {};
        revenueData?.forEach((t: any) => {
            const loc = t.apartment_location;
            revenuePerLocation[loc] = (revenuePerLocation[loc] || 0)
                + (t.cash_amount || 0) + (t.transfer_amount || 0);
        });

        // 5. Build location health items
        const items: LocationHealthItem[] = locations.map((loc) => {
            const totalUnits = roomsPerLocation[loc.name] || loc.totalRooms || 0;
            const occupiedUnits = occupiedPerLocation[loc.name]?.size || 0;
            const availableUnits = Math.max(0, totalUnits - occupiedUnits);
            const occupancyRate = totalUnits > 0
                ? Math.round((occupiedUnits / totalUnits) * 10000) / 100
                : 0;
            const revenue = revenuePerLocation[loc.name] || 0;
            const revenuePerUnit = occupiedUnits > 0
                ? Math.round(revenue / occupiedUnits)
                : (totalUnits > 0 ? Math.round(revenue / totalUnits) : 0);

            return {
                location: loc.name,
                totalUnits,
                occupiedUnits,
                availableUnits,
                occupancyRate,
                revenue,
                revenuePerUnit,
                status: 'no_data' as const,
            };
        });

        // 6. Apply status computation
        return applyLocationHealthStatuses(items);
    } catch (error) {
        console.error('Error in fetchLocationHealthData:', error);
        return [];
    }
}

/**
 * Fetch unit performance data: idle units, top 5 units by revenue, bottom 5 units.
 *
 * Idle detection:
 * - For each room, find the most recent checkout (checkout_at < now).
 * - idleDays = days since lastCheckoutAt.
 * - Filter where idleDays >= 3, sorted descending.
 *
 * Revenue (calendar-aligned month — intentional, not report-period-dependent):
 * - SUM(cash_amount + transfer_amount) per room for current month.
 * - Top 5 by revenue descending, bottom 5 by revenue ascending (non-zero).
 *
 * This function does NOT use report_period_mode because:
 * - Idle detection is absolute time, not period-defined.
 * - Month revenue is calendar-aligned for consistency with "month to date" semantics.
 */
export async function fetchUnitPerformanceData(): Promise<UnitPerformanceData> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const now = new Date();
    const nowIso = now.toISOString();

    try {
        // ── 1. Fetch all rooms with location info ─────────────
        // Note: nomor_kamar.lokasi is a VARCHAR column (not a FK relationship),
        // so we cannot use nested select like lokasi(id, nama:name).
        // We select the lokasi column directly (it stores the location name).
        const { data: rooms, error: roomError } = await supabase
            .from('nomor_kamar')
            .select('id, name, lokasi, status, created_at');

        if (roomError) {
            console.error('Error fetching rooms for unit performance:', roomError);
            return { idleUnits: [], topUnits: [], bottomUnits: [] };
        }

        if (!rooms || rooms.length === 0) {
            return { idleUnits: [], topUnits: [], bottomUnits: [] };
        }

        // Normalize rooms: lokasi is a VARCHAR string containing the location name
        type RoomRow = {
            id: number;
            name: string;
            lokasi: string | null;
            status: string;
            created_at: string;
        };

        const normalizedRooms: { id: number; unitCode: string; location: string; status: string; createdAt: string }[] =
            (rooms as unknown as RoomRow[]).map((r) => ({
                id: r.id,
                // Fallback: use name first, then lokasi, then raw room_number/id
                unitCode: r.name ?? r.lokasi ?? String(r.id),
                location: r.lokasi ?? '',
                status: r.status,
                createdAt: r.created_at,
            }));

        // ── 2. For each room, find last checkout ──────────────
        // Batch fetch: get all transactions with checkout_at < now for these rooms
        const { data: allCheckouts, error: checkoutError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, checkout_at')
            .lt('checkout_at', nowIso)
            .order('checkout_at', { ascending: false });

        if (checkoutError) {
            console.error('Error fetching checkouts for idle detection:', checkoutError);
        }

        // Build map: location+roomNumber -> latest checkout_at
        const latestCheckoutMap = new Map<string, string>();
        (allCheckouts || []).forEach((tx: any) => {
            const key = `${tx.apartment_location}-${tx.room_number}`;
            // First occurrence is the most recent due to descending sort
            if (!latestCheckoutMap.has(key)) {
                latestCheckoutMap.set(key, tx.checkout_at);
            }
        });

        // ── 3. Calculate idle for each room ───────────────────
        // Also get current month revenue for idle units display
        const nowWib = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const monthStart = new Date(nowWib.getFullYear(), nowWib.getMonth(), 1);
        const monthStartIso = monthStart.toISOString();
        // End of current month in WIB
        const monthEnd = new Date(nowWib.getFullYear(), nowWib.getMonth() + 1, 0, 23, 59, 59, 999);
        const monthEndIso = monthEnd.toISOString();

        // Batch fetch: get revenue per room for current month (calendar-aligned)
        const { data: monthTx, error: monthTxError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, cash_amount, transfer_amount')
            .gte('checkin_at', monthStartIso)
            .lte('checkin_at', monthEndIso);

        if (monthTxError) {
            console.error('Error fetching month transactions:', monthTxError);
        }

        // Build revenue map per room
        const revenueMap = new Map<string, number>();
        const bookingCountMap = new Map<string, number>();
        (monthTx || []).forEach((tx: any) => {
            const key = `${tx.apartment_location}-${tx.room_number}`;
            const rev = (tx.cash_amount || 0) + (tx.transfer_amount || 0);
            revenueMap.set(key, (revenueMap.get(key) || 0) + rev);
            bookingCountMap.set(key, (bookingCountMap.get(key) || 0) + 1);
        });

        // ── 4. Build idle unit list ───────────────────────────
        const idleUnits: IdleUnitItem[] = [];

        for (const room of normalizedRooms) {
            const key = `${room.location}-${room.unitCode}`;
            const lastCheckout = latestCheckoutMap.get(key) || null;

            let idleDays: number;
            if (lastCheckout) {
                idleDays = Math.floor(
                    (now.getTime() - new Date(lastCheckout).getTime()) / (1000 * 60 * 60 * 24)
                );
            } else {
                // No transaction ever — use room creation date as proxy
                // If room created recently, idleDays may be 0 or small; skip in that case
                const createdAt = room.createdAt;
                idleDays = createdAt
                    ? Math.floor(
                        (now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
                    )
                    : 999; // unknown — show as potentially idle
            }

            if (idleDays >= 3) {
                idleUnits.push({
                    unitId: String(room.id),
                    unitCode: room.unitCode,
                    location: room.location,
                    currentStatus: room.status,
                    lastCheckoutAt: lastCheckout,
                    idleDays,
                    monthRevenue: revenueMap.get(key) || 0,
                    severity: getIdleSeverity(idleDays),
                });
            }
        }

        // Sort by idleDays descending (most idle first)
        idleUnits.sort((a, b) => b.idleDays - a.idleDays);

        // ── 5. Build performance list (top/bottom) ────────────
        const perfItems: UnitPerformanceItem[] = normalizedRooms.map((room) => {
            const key = `${room.location}-${room.unitCode}`;
            const revenue = revenueMap.get(key) || 0;
            const bookingCount = bookingCountMap.get(key) || 0;
            const lastCheckout = latestCheckoutMap.get(key) || null;
            const idleDays = lastCheckout
                ? Math.floor(
                    (now.getTime() - new Date(lastCheckout).getTime()) / (1000 * 60 * 60 * 24)
                )
                : undefined;

            return {
                unitId: String(room.id),
                unitCode: room.unitCode,
                location: room.location,
                revenue,
                bookingCount,
                idleDays,
            };
        });

        // Top 5 by revenue descending
        const topUnits = [...perfItems]
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        // Bottom 5 by revenue ascending (excluding zero-revenue items from sort,
        // but still including them in result)
        const nonZero = perfItems.filter((p) => p.revenue > 0);
        const zeroRev = perfItems.filter((p) => p.revenue === 0);
        const bottomUnits = [
            ...nonZero.sort((a, b) => a.revenue - b.revenue).slice(0, 5),
            ...zeroRev.slice(0, 5),
        ].slice(0, 5);

        return { idleUnits, topUnits, bottomUnits };
    } catch (error) {
        console.error('Error in fetchUnitPerformanceData:', error);
        return { idleUnits: [], topUnits: [], bottomUnits: [] };
    }
}

/**
 * Fetch marketing (source) performance data for the current report period.
 *
 * Uses getTodayReportRange() for period-aware boundaries.
 * Aggregates marketing_name from transactions, summing cash_amount + transfer_amount.
 * Null/empty marketing_name → 'Tidak Diketahui'.
 */
export async function fetchMarketingPerformanceData(): Promise<{
    items: MarketingPerformanceItem[];
    totalRevenue: number;
    totalTransactions: number;
    activeChannels: number;
}> {
    const supabase = createServerClient();
    const { start, end } = await getTodayReportRange();

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('marketing_name, cash_amount, transfer_amount')
            .gte('checkin_at', start)
            .lte('checkin_at', end);

        if (error) {
            console.error('Error fetching marketing performance:', error);
            throw new Error(`Gagal mengambil data marketing: ${error.message}`);
        }

        if (!data || data.length === 0) {
            return { items: [], totalRevenue: 0, totalTransactions: 0, activeChannels: 0 };
        }

        // Aggregate in JS
        const channelMap = new Map<string, { count: number; revenue: number }>();
        let totalRevenue = 0;
        let totalTx = 0;

        data.forEach((tx: { marketing_name: string | null; cash_amount: number | null; transfer_amount: number | null }) => {
            const channel = normalizeMarketingName(tx.marketing_name);
            const revenue = (tx.cash_amount || 0) + (tx.transfer_amount || 0);
            const existing = channelMap.get(channel) || { count: 0, revenue: 0 };
            existing.count += 1;
            existing.revenue += revenue;
            channelMap.set(channel, existing);
            totalRevenue += revenue;
            totalTx += 1;
        });

        const items: MarketingPerformanceItem[] = Array.from(channelMap.entries())
            .map(([channel, data]) => ({
                channel,
                transactionCount: data.count,
                totalRevenue: data.revenue,
                averageTransaction: data.count > 0 ? data.revenue / data.count : 0,
                percentageOfRevenue: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
                percentageOfTransactions: totalTx > 0 ? (data.count / totalTx) * 100 : 0,
                status: 'normal' as MarketingPerformanceStatus,
            }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue);

        // Apply statuses
        items.forEach(item => {
            item.status = getMarketingStatus(item, items);
        });

        return {
            items,
            totalRevenue,
            totalTransactions: totalTx,
            activeChannels: items.filter(i => i.channel !== 'Tidak Diketahui').length,
        };
    } catch (error) {
        console.error('Error in fetchMarketingPerformanceData:', error);
        return { items: [], totalRevenue: 0, totalTransactions: 0, activeChannels: 0 };
    }
}

// ─── Export Functions ─────────────────────────────────────────────

/**
 * Fetch revenue data formatted for XLSX export (last 30 days daily)
 */
export async function fetchRevenueDataForExport() {
    try {
        const now = new Date();
        const startDate = format(subDays(now, 29), 'yyyy-MM-dd');
        const endDate = format(now, 'yyyy-MM-dd');
        const revenueTrend = await getRevenueTrend(startDate, endDate);
        return revenueTrend.map((point) => ({
            date: format(new Date(point.date), 'dd MMM yyyy'),
            grossRevenue: point.revenue || 0,
            platformFee: 0,
            netRevenue: point.revenue || 0,
            transactionCount: point.transactionCount || 0,
        }));
    } catch (error) {
        console.error('Error fetching revenue data for export:', error);
        return [];
    }
}

/**
 * Fetch occupancy data formatted for XLSX export (last 30 days)
 */
export async function fetchOccupancyDataForExport() {
    try {
        const trend = await getDailyOccupancyTrend(30);
        return trend.map((point) => ({
            date: format(new Date(point.date), 'dd MMM yyyy'),
            totalUnits: point.totalUnits || 0,
            occupiedUnits: point.occupiedUnits || 0,
            availableUnits: (point.totalUnits || 0) - (point.occupiedUnits || 0),
            occupancyRate: point.occupancyRate || 0,
        }));
    } catch (error) {
        console.error('Error fetching occupancy data for export:', error);
        return [];
    }
}
