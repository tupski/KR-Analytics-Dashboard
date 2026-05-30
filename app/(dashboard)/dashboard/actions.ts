'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getTodayReportRange } from '@/lib/get-report-period-setting';
import { getReportPeriodRange } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';
import { getLiveOccupancy, getDailyOccupancyTrend } from '@/lib/services/occupancy';
import { getRevenueTrend } from '@/lib/services/revenue';
import { getLocations } from '@/lib/services/location';
import { applyLocationHealthStatuses } from '@/lib/dashboard/location-health';
import type { LocationHealthItem } from '@/types/dashboard';
import { format, subDays, subWeeks, subMonths, subYears, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
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
 * Fetches: booking count today, revenue today, average occupancy, available units.
 * Uses Asia/Jakarta timezone for "today" date calculations.
 *
 * If compareMode provided, also fetches the same metrics for the comparison day
 * and includes percentage change.
 *
 */
export async function fetchKPIData(compareMode?: KPICompareMode): Promise<KPIData> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

    try {
        // Total rooms (used for occupancy denominator across snapshots)
        const { count: totalRooms } = await supabase
            .from('nomor_kamar')
            .select('id', { count: 'exact', head: true });
        const totalRoomsCount = totalRooms || 0;

        // Today's snapshot — uses report_period_mode from DB (calendar_day or hotel_day)
        const { start: dayStart, end: dayEnd } = await getTodayReportRange();

        // Fetch mode for comparison snapshot parity
        const { getReportPeriodSetting } = await import('@/lib/get-report-period-setting');
        const mode = await getReportPeriodSetting();

        const { count: bookingCount } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .gte('checkin_at', dayStart)
            .lte('checkin_at', dayEnd);

        const { data: revenueData } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', dayStart)
            .lte('checkin_at', dayEnd);

        const todayRevenue = revenueData?.reduce(
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
            revenueToday: todayRevenue,
            avgOccupancy,
            availableUnits,
        };

        // Comparison snapshot — uses same mode as today's KPI for apples-to-apples comparison
        if (compareMode) {
            const { day: prevDay, label: prevLabel } = getCompareDay(today, compareMode);
            const prevSnap = await fetchDailyKPISnapshot(supabase, prevDay, totalRoomsCount, mode);

            result.prev = {
                booking: prevSnap.bookingCount,
                revenue: prevSnap.revenue,
                avgOccupancy: prevSnap.avgOccupancy,
                availableUnits: prevSnap.availableUnits,
                label: prevLabel,
                mode: compareMode,
            };
            result.change = {
                bookingChangePct: pctChange(result.bookingToday, prevSnap.bookingCount),
                revenueChangePct: pctChange(result.revenueToday, prevSnap.revenue),
                occupancyChangePct: pctChange(result.avgOccupancy, prevSnap.avgOccupancy),
                availableChangePct: pctChange(result.availableUnits, prevSnap.availableUnits),
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
