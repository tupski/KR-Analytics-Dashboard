'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getTodayReportRange } from '@/lib/get-report-period-setting';
import type { ReportPeriodMode } from '@/lib/shared/report-period';
import { getReportPeriodRange } from '@/lib/shared/report-period';
import type { ReportPeriodRange } from '@/lib/shared/report-period';
import { getLiveOccupancy, getDailyOccupancyTrend } from '@/lib/services/occupancy';
import { getRevenueTrend, getRevenueSummary as getServiceRevenueSummary } from '@/lib/services/revenue';
import { getLocations } from '@/lib/services/location';
import { applyLocationHealthStatuses } from '@/lib/dashboard/location-health';
import { getIdleSeverity } from '@/lib/dashboard/unit-performance';
import type { LocationHealthItem, IdleUnitItem, UnitPerformanceItem, MarketingPerformanceItem, MarketingPerformanceStatus } from '@/types/dashboard';
import { normalizeMarketingName, getMarketingStatus } from '@/lib/dashboard/marketing-performance';
import type { UnitPerformanceData } from '@/lib/dashboard/unit-performance';
import { getKPIData } from '@/lib/dashboard/kpi';
import { getRevenueSummary } from '@/lib/dashboard/revenue';
import { getOccupancySummary } from '@/lib/dashboard/occupancy';
import { getOperationsSummary } from '@/lib/dashboard/operations';
import { format, addDays, subDays, subWeeks, subMonths, subYears, startOfWeek, startOfMonth, startOfYear, parse } from 'date-fns';
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
 * Helper: build a ReportPeriodRange from start/end ISO datetime strings.
 * Used to bridge existing date-flow code with the new shared period type.
 */
function buildPeriodFromISO(startISO: string, endISO: string): ReportPeriodRange {
    // Extract YYYY-MM-DD from ISO strings like "2026-06-07T00:00:00.000+07:00"
    const startDate = startISO.substring(0, 10);
    const endDateISO = new Date(endISO);
    const endDate = endISO.substring(0, 10);
    // Try to detect the mode from the hour (12:00 = hotel_day)
    const mode: ReportPeriodRange['mode'] = startISO.includes('T12:') ? 'hotel_day' : 'calendar_day';

    // Compute exclusive end: next day at 00:00:00 (calendar_day) or 12:00:00 (hotel_day)
    const endExclusiveDateObj = addDays(endDateISO, 1);
    const excY = endExclusiveDateObj.getFullYear();
    const excM = String(endExclusiveDateObj.getMonth() + 1).padStart(2, '0');
    const excD = String(endExclusiveDateObj.getDate()).padStart(2, '0');
    const endExclusiveDate = `${excY}-${excM}-${excD}`;
    const excHour = mode === 'hotel_day' ? '12:00:00.000' : '00:00:00.000';
    const endExclusiveISO = `${endExclusiveDate}T${excHour}+07:00`;

    return {
        preset: 'custom',
        mode,
        timezone: 'Asia/Jakarta',
        start: new Date(startISO),
        end: new Date(endISO),
        startISO,
        endISO,
        startDate,
        endDate,
        endExclusiveISO,
        endExclusiveDate,
        label: `${startDate} – ${endDate}`,
    };
}

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
export async function fetchTodayCheckins(dateParams?: DateFilterParams): Promise<CheckinItem[]> {
    const supabase = createServerClient();
    // Use dateParams if provided, otherwise fall back to today
    let start: string;
    let exclusEnd: string;
    if (dateParams?.rangePreset || (dateParams?.startDate && dateParams?.endDate)) {
        const { getReportPeriodSetting } = await import('@/lib/get-report-period-setting');
        const mode = await getReportPeriodSetting();
        const range = computeDateRange(dateParams.rangePreset || 'custom', dateParams.startDate, dateParams.endDate, mode);
        start = range.start;
        exclusEnd = range.endExclusiveISO ?? (() => { throw new Error('endExclusiveISO missing from date range'); })();
    } else {
        const todayRange = await getTodayReportRange();
        start = todayRange.start;
        exclusEnd = todayRange.endExclusiveISO;
    }

    try {
        // Use COALESCE: checkin_at >= start OR (checkin IS NULL AND created_at >= start)
        // Exclusive end boundaries for correct `<` filtering
        const { data, error } = await supabase
            .from('transactions')
            .select('id, apartment_location, room_number, customer_name, checkin_at, created_at')
            .or(
                `and(checkin_at.gte.${start},checkin_at.lt.${exclusEnd}),` +
                `and(checkin_at.is.null,created_at.gte.${start},created_at.lt.${exclusEnd})`
            )
            .order('checkin_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error fetching check-ins:', error);
            throw new Error(`Gagal mengambil data check-in: ${error.message}`);
        }

        if (!data) return [];

        // JS filter: keep only where effective_date < exclusive end
        const filtered = data.filter((item: any) => {
            const effDate = item.checkin_at || item.created_at;
            return effDate && effDate >= start && effDate < exclusEnd;
        });

        return filtered.map((item: {
            id: string;
            apartment_location: string;
            room_number: string;
            customer_name: string;
            checkin_at: string;
            created_at: string;
        }) => ({
            id: item.id,
            apartmentLocation: item.apartment_location,
            roomNumber: item.room_number,
            customerName: item.customer_name,
            time: format(new Date(item.checkin_at || item.created_at), 'HH:mm'),
            checkinAt: new Date(item.checkin_at || item.created_at)
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
export async function fetchTodayCheckouts(dateParams?: DateFilterParams): Promise<CheckoutItem[]> {
    const supabase = createServerClient();
    // Use dateParams if provided, otherwise fall back to today
    let start: string;
    let exclusEnd: string;
    if (dateParams?.rangePreset || (dateParams?.startDate && dateParams?.endDate)) {
        const { getReportPeriodSetting } = await import('@/lib/get-report-period-setting');
        const mode = await getReportPeriodSetting();
        const range = computeDateRange(dateParams.rangePreset || 'custom', dateParams.startDate, dateParams.endDate, mode);
        start = range.start;
        exclusEnd = range.endExclusiveISO ?? (() => { throw new Error('endExclusiveISO missing from date range'); })();
    } else {
        const todayRange = await getTodayReportRange();
        start = todayRange.start;
        exclusEnd = todayRange.endExclusiveISO;
    }

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('id, apartment_location, room_number, customer_name, checkout_at, checkin_at, created_at')
            .gte('checkout_at', start)
            .lt('checkout_at', exclusEnd)
            .order('checkout_at', { ascending: true })
            .limit(10);

        if (error) {
            console.error('Error fetching check-outs:', error);
            throw new Error(`Gagal mengambil data check-out: ${error.message}`);
        }

        if (!data) return [];

        const filtered = data.filter((item: any) => {
            const checkoutDate = item.checkout_at;
            return checkoutDate && checkoutDate >= start && checkoutDate < exclusEnd;
        });

        return filtered.map((item: {
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
    const range = getReportPeriodRange({ preset: 'custom', startDate: targetDay, endDate: targetDay, mode: mode ?? 'calendar_day', timezone: 'Asia/Jakarta' });
    const dayStart = range.startISO;
    const dayExclusEnd = range.endExclusiveISO;

    // Use COALESCE(checkin_at, created_at) with exclusive end
    // Widen filter: checkin_at >= start OR (checkin IS NULL AND created_at >= start)
    // Then JS-filter for exclusive end
    const [{ count: bookingCount }, { data: txData }] = await Promise.all([
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .or(`checkin_at.gte.${dayStart},and(checkin_at.is.null,created_at.gte.${dayStart})`),
        supabase
            .from('transactions')
            .select('cash_amount, transfer_amount, room_number, apartment_location, checkin_at, created_at')
            .or(`checkin_at.gte.${dayStart},and(checkin_at.is.null,created_at.gte.${dayStart})`),
    ]);

    // JS filter: effective_date < dayEnd (exclusive)
    const filtered = (txData || []).filter((t: any) => {
        const effDate = t.checkin_at || t.created_at;
        return effDate && effDate >= dayStart && effDate < dayExclusEnd;
    });

    const revenue = filtered.reduce(
        (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0),
        0,
    ) || 0;

    const distinctRoomsOccupied = new Set(
        filtered.map((t: any) => `${t.apartment_location}-${t.room_number}`),
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
    const today = new Date(todayStr + 'T00:00:00+07:00');
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
        const todayFallback = range ? null : await getTodayReportRange();
        const actualDayStart = range?.start || todayFallback!.start;
        const actualDayEnd = range?.end || todayFallback!.end;
        const actualDayExclusEnd = range?.endExclusiveISO || todayFallback!.endExclusiveISO;

        const { count: bookingCount } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .or(
                `and(checkin_at.gte.${actualDayStart},checkin_at.lt.${actualDayExclusEnd}),` +
                `and(checkin_at.is.null,created_at.gte.${actualDayStart},created_at.lt.${actualDayExclusEnd})`
            );

        // Build ReportPeriodRange for the main period to pass to the service
        const mainPeriod = buildPeriodFromISO(actualDayStart, actualDayEnd);
        const revenueData = await getServiceRevenueSummary(mainPeriod);
        const periodRevenue = revenueData.totalRevenue;

        // Occupancy & available — point-in-time (currently active)
        // Uses centralized getLiveOccupancy() for consistency across dashboard + unit pages.
        const liveOccupancy = await getLiveOccupancy();
        const currentlyOccupiedCount = liveOccupancy.ditempati;
        const avgOccupancy = liveOccupancy.occupancyRate;
        const availableUnits = liveOccupancy.tersedia;

        const result: KPIData = {
            bookingToday: bookingCount || 0,
            revenueToday: periodRevenue,
            avgOccupancy,
            availableUnits,
        };

        // Compute comparison range from dateParams or legacy compareMode
        let compRange: { start: string; end: string; label: string; endExclusiveISO?: string } | null = null;

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
            const snap = getReportPeriodRange({ preset: 'custom', startDate: prevDay, endDate: prevDay, mode, timezone: 'Asia/Jakarta' });
            compRange = { start: snap.startISO, end: snap.endISO, endExclusiveISO: snap.endExclusiveISO, label: prevLabel };
        }

        if (compRange) {
            const compExclusEnd = compRange.endExclusiveISO ?? (() => { throw new Error('endExclusiveISO missing from comparison range'); })();
            const { count: prevBookingCount } = await supabase
                .from('transactions')
                .select('*', { count: 'exact', head: true })
                .or(
                    `and(checkin_at.gte.${compRange.start},checkin_at.lt.${compExclusEnd}),` +
                    `and(checkin_at.is.null,created_at.gte.${compRange.start},created_at.lt.${compExclusEnd})`
                );

            const prevPeriod = buildPeriodFromISO(compRange.start, compRange.end);
            const prevRevenueData = await getServiceRevenueSummary(prevPeriod);
            const prevRevenue = prevRevenueData.totalRevenue;

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
        const todayPlus1 = addDays(today, 1);
        const { data, error } = await supabase.rpc('get_daily_revenue_trend', {
            p_start_date: format(startDate, 'yyyy-MM-dd'),
            p_end_date: format(todayPlus1, 'yyyy-MM-dd'),
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
/**
 * Server action to fetch expense trend data for chart comparison.
 * Avoids importing pg-dependent modules in client components.
 */
export async function getExpenseTrendAction(
    startDate: string,
    endDate: string,
    groupBy: 'day' | 'month' = 'day'
): Promise<{ date: string; amount: number }[]> {
    try {
        const { getExpenseTrend } = await import('@/lib/services/expense');
        const expenses = await getExpenseTrend(startDate, endDate, groupBy);
        return expenses.map(e => ({ date: e.date, amount: e.total_amount }));
    } catch {
        return [];
    }
}

/**
 * Zero-fill missing dates in daily revenue data.
 * Ensures every date from startDate to endDate (WIB) has an entry.
 */
function zeroFillDateRange(
    data: { transaction_date: string; total_revenue: number; transaction_count: number }[],
    startDateStr: string,
    endDateStr: string
) {
    const result: typeof data = [];
    const current = new Date(startDateStr + 'T00:00:00+07:00');
    const end = new Date(endDateStr + 'T00:00:00+07:00');
    const dataMap = new Map(data.map(d => [d.transaction_date, d]));

    while (current <= end) {
        const key = format(toZonedTime(current, 'Asia/Jakarta'), 'yyyy-MM-dd');
        const existing = dataMap.get(key);
        result.push(existing || { transaction_date: key, total_revenue: 0, transaction_count: 0 });
        current.setDate(current.getDate() + 1);
    }
    return result;
}

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

    // Convert to WIB-aware date strings
    const startWIB = format(toZonedTime(startDate, 'Asia/Jakarta'), 'yyyy-MM-dd');
    // Use exclusive end: today+1 so end date is exclusive (< tomorrow)
    const todayWIB = format(toZonedTime(addDays(today, 1), 'Asia/Jakarta'), 'yyyy-MM-dd');

    try {
        // Build chart period explicitly: last 30 days
        const chartPeriod = getReportPeriodRange({ preset: 'last_30_days', timezone: 'Asia/Jakarta' });
        const trendPoints = await getRevenueTrend(chartPeriod);

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

        // Zero-fill missing dates for daily filter only
        let aggregated = aggregateRevenueData(mapped, filter);

        if (filter === 'daily') {
            // Zero-fill raw data before aggregation to catch missing dates
            const zeroFilled = zeroFillDateRange(mapped, startWIB, todayWIB);
            aggregated = aggregateRevenueData(zeroFilled, filter);
        }

        return aggregated;
    } catch (error) {
        console.warn('[dashboard] Revenue service unavailable, falling back to legacy:', error);
    }

    return fetchRevenueDataLegacy(filter);
}

/**
 * Fetch occupancy rate data for specified period.
 *
 * Delegates to getDailyOccupancyTrend() with dynamic range.
 * When dateParams provided, range is derived from actualDayStart→actualDayEnd.
 * Otherwise uses default 30-day lookback.
 *
 * @param days Number of days to fetch (default 30, ignored when dateParams provided)
 * @param dateParams Optional date filter to override default range
 * @returns Promise<OccupancyDataPoint[]> Array of occupancy data points
 */
export async function fetchOccupancyData(
    days: number = 30,
    dateParams?: DateFilterParams,
): Promise<OccupancyDataPoint[]> {
    if (dateParams?.rangePreset || dateParams?.startDate) {
        const { getReportPeriodSetting } = await import('@/lib/get-report-period-setting');
        const mode = await getReportPeriodSetting();
        const range = computeDateRange(
            dateParams.rangePreset || 'custom',
            dateParams.startDate,
            dateParams.endDate,
            mode,
        );
        // Use the date range to compute days count (minimum 1)
        const start = new Date(range.start);
        const end = new Date(range.end);
        const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
        return getDailyOccupancyTrend(diffDays);
    }
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
    const { start: periodStart, end: periodEnd, endExclusiveISO: periodExclusEnd } = await getTodayReportRange();

    try {
        // 1. Get all locations with room counts
        const locations = await getLocations();
        if (locations.length === 0) return [];

        // 2. Use centralized getLiveOccupancy() for occupancy per location
        const liveOccupancy = await getLiveOccupancy();
        const liveByLocation = new Map(
            liveOccupancy.locationBreakdown.map(item => [item.name, item])
        );

        // 3. Get revenue per location within the report period — using COALESCE with start-end boundary
        const { data: revenueData } = await supabase
            .from('transactions')
            .select('apartment_location, cash_amount, transfer_amount, checkin_at, created_at')
            .or(
                `and(checkin_at.gte.${periodStart},checkin_at.lt.${periodExclusEnd}),` +
                `and(checkin_at.is.null,created_at.gte.${periodStart},created_at.lt.${periodExclusEnd})`
            );

        const revenuePerLocation: Record<string, number> = {};
        revenueData?.forEach((t: any) => {
            const effDate = t.checkin_at || t.created_at;
            if (effDate && effDate >= periodStart && effDate < periodExclusEnd) {
                const loc = t.apartment_location;
                revenuePerLocation[loc] = (revenuePerLocation[loc] || 0)
                    + (t.cash_amount || 0) + (t.transfer_amount || 0);
            }
        });

        // 4. Build location health items
        const items: LocationHealthItem[] = locations.map((loc) => {
            const live = liveByLocation.get(loc.name);
            const totalUnits = live?.totalRooms ?? loc.totalRooms ?? 0;
            const occupiedUnits = live?.occupiedRooms ?? 0;
            const availableUnits = Math.max(0, totalUnits - occupiedUnits);
            const occupancyRate = live?.occupancyRate ?? 0;
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

        // 5. Apply status computation
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

        // Batch fetch: get revenue per room for current month (calendar-aligned) — using COALESCE pattern
        const { data: monthTx, error: monthTxError } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, cash_amount, transfer_amount, checkin_at, created_at')
            .or(`checkin_at.gte.${monthStartIso},and(checkin_at.is.null,created_at.gte.${monthStartIso})`);

        if (monthTxError) {
            console.error('Error fetching month transactions:', monthTxError);
        }

        // Build revenue map per room — apply exclusive-end filter
        const revenueMap = new Map<string, number>();
        const bookingCountMap = new Map<string, number>();
        (monthTx || []).forEach((tx: any) => {
            const effDate = tx.checkin_at || tx.created_at;
            if (!effDate || effDate < monthStartIso || effDate >= monthEndIso) return;
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
    const { start, end, endExclusiveISO: exclusEnd } = await getTodayReportRange();

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('marketing_name, cash_amount, transfer_amount, checkin_at, created_at')
            .or(`checkin_at.gte.${start},and(checkin_at.is.null,created_at.gte.${start})`);

        if (error) {
            console.error('Error fetching marketing performance:', error);
            throw new Error(`Gagal mengambil data marketing: ${error.message}`);
        }

        if (!data || data.length === 0) {
            return { items: [], totalRevenue: 0, totalTransactions: 0, activeChannels: 0 };
        }

        // Aggregate in JS — apply exclusive-end filter
        const channelMap = new Map<string, { count: number; revenue: number }>();
        let totalRevenue = 0;
        let totalTx = 0;

        data.forEach((tx: { marketing_name: string | null; cash_amount: number | null; transfer_amount: number | null; checkin_at: string; created_at: string }) => {
            const effDate = tx.checkin_at || tx.created_at;
            if (!effDate || effDate < start || effDate >= exclusEnd) return;
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
        const exportPeriod = getReportPeriodRange({ preset: 'last_30_days', timezone: 'Asia/Jakarta' });
        const revenueTrend = await getRevenueTrend(exportPeriod);
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

// ============================================================
// fetchDashboardSnapshot()
//
// Consolidated dashboard snapshot — replaces 6+ parallel fetches.
// Calls the aggregation layer (lib/dashboard/*) which deduplicates
// room count and occupancy queries.
//
// All existing individual action functions remain unchanged for
// backward compatibility.
// ============================================================

export interface DashboardSnapshot {
    kpi: import('@/lib/dashboard/kpi').KPIDataResult;
    revenue: import('@/lib/dashboard/revenue').RevenueSummaryResult;
    occupancy: import('@/lib/dashboard/occupancy').OccupancySummaryResult;
    operations: import('@/lib/dashboard/operations').OperationsSummaryResult;
}

/**
 * Fetch complete dashboard data snapshot.
 *
 * Calls all 4 aggregation functions in parallel. Room count is
 * fetched once and passed to getKPIData + getOccupancySummary
 * to avoid duplicate nomor_kamar queries.
 *
 * @param params.startDate  Optional start date string (auto-calculated if omitted)
 * @param params.endDate    Optional end date string (auto-calculated if omitted)
 * @param params.location   Optional location filter
 */
export async function fetchDashboardSnapshot(params: {
    startDate?: string;
    endDate?: string;
    location?: string;
}): Promise<DashboardSnapshot> {
    const { getReportPeriodSetting } = await import('@/lib/get-report-period-setting');
    const mode = await getReportPeriodSetting();

    // Build the period from params or fall back to today
    let period: ReportPeriodRange;
    if (params.startDate && params.endDate) {
        period = getReportPeriodRange({
            preset: 'custom',
            startDate: params.startDate,
            endDate: params.endDate,
            mode,
            timezone: 'Asia/Jakarta',
        });
    } else {
        period = getReportPeriodRange({ preset: 'today', mode, timezone: 'Asia/Jakarta' });
    }

    // Fetch total room count once — pass to downstream functions
    const { count: totalUnits } = await createServerClient()
        .from('nomor_kamar')
        .select('id', { count: 'exact', head: true });

    const [kpi, revenue, occupancy, operations] = await Promise.all([
        getKPIData({ period, location: params.location, totalUnits: totalUnits || 0 }),
        getRevenueSummary({ period, location: params.location }),
        getOccupancySummary({ period, location: params.location, totalUnits: totalUnits || 0 }),
        getOperationsSummary({ startDate: new Date(period.startISO), endDate: new Date(period.endISO), location: params.location }),
    ]);

    return { kpi, revenue, occupancy, operations };
}
