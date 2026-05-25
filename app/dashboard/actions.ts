'use server';

import { createServerClient } from '@/lib/supabase/server';
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
 * Fetches unit status summary derived from lokasi_apartemen and today's transactions.
 * Since there is no dedicated unit_apartemen table, we derive status from:
 * - Total rooms from lokasi_apartemen
 * - Occupied rooms from today's active transactions
 * 
 * @returns Promise<UnitStatusCounts> Object containing counts for each unit status
 * 
 * Requirements: 5.4, 5.5, 5.6, 5.7, 5.8
 */
export async function fetchUnitStatus(): Promise<UnitStatusCounts> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

    try {
        // Get total rooms from nomor_kamar table (count per location)
        const { data: rooms, error: roomError, count: totalRoomCount } = await supabase
            .from('nomor_kamar')
            .select('id, lokasi', { count: 'exact' });

        if (roomError) {
            console.error('Error fetching rooms:', roomError);
        }

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

        // Derive status counts
        const statusCounts: UnitStatusCounts = {
            tersedia: Math.max(0, totalRooms - occupiedRooms),
            ditempati: occupiedRooms,
        };

        return statusCounts;
    } catch (error) {
        console.error('Error in fetchUnitStatus:', error);
        // Return zeros instead of throwing to prevent dashboard from crashing
        return {
            tersedia: 0,
            ditempati: 0,
        };
    }
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
 * Requirements: 4.2, 4.4, 4.11, 14.2
 */
export async function fetchTodayCheckins(): Promise<CheckinItem[]> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('id, apartment_location, room_number, customer_name, checkin_at')
            .gte('checkin_at', `${today}T00:00:00`)
            .lt('checkin_at', `${today}T23:59:59`)
            .order('checkin_at', { ascending: true })
            .limit(5);

        if (error) {
            console.error('Error fetching check-ins:', error);
            throw new Error(`Failed to fetch check-ins: ${error.message}`);
        }

        if (!data) {
            return [];
        }

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
        throw new Error('Failed to fetch check-ins');
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
 * Requirements: 4.3, 4.5, 4.11, 14.2
 */
export async function fetchTodayCheckouts(): Promise<CheckoutItem[]> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('id, apartment_location, room_number, customer_name, checkout_at')
            .gte('checkout_at', `${today}T00:00:00`)
            .lt('checkout_at', `${today}T23:59:59`)
            .order('checkout_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Error fetching check-outs:', error);
            throw new Error(`Failed to fetch check-outs: ${error.message}`);
        }

        if (!data) {
            return [];
        }

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
        throw new Error('Failed to fetch check-outs');
    }
}

/**
 * Compute KPI snapshot for a specific Asia/Jakarta calendar day (yyyy-MM-dd).
 * - bookingCount: # transactions with checkin on that day
 * - revenue: sum of cash + transfer for those transactions
 * - distinctRoomsOccupied: # unique rooms used that day (proxy for end-of-day occupancy)
 */
async function fetchDailyKPISnapshot(
    supabase: ReturnType<typeof createServerClient>,
    targetDay: string,
    totalRoomsCount: number,
): Promise<{ bookingCount: number; revenue: number; distinctRoomsOccupied: number; avgOccupancy: number; availableUnits: number }> {
    const dayStart = `${targetDay}T00:00:00`;
    const dayEnd = `${targetDay}T23:59:59`;

    const [{ count: bookingCount }, { data: txData }] = await Promise.all([
        supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .gte('checkin_at', dayStart)
            .lt('checkin_at', dayEnd),
        supabase
            .from('transactions')
            .select('cash_amount, transfer_amount, room_number, apartment_location')
            .gte('checkin_at', dayStart)
            .lt('checkin_at', dayEnd),
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
 * Requirements: 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 14.1, 14.2, 14.6
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

        // Today's snapshot — use point-in-time for "currently occupied" and day-window for booking/revenue
        const dayStart = `${today}T00:00:00`;
        const dayEnd = `${today}T23:59:59`;

        const { count: bookingCount } = await supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .gte('checkin_at', dayStart)
            .lt('checkin_at', dayEnd);

        const { data: revenueData } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', dayStart)
            .lt('checkin_at', dayEnd);

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

        // Comparison snapshot
        if (compareMode) {
            const { day: prevDay, label: prevLabel } = getCompareDay(today, compareMode);
            const prevSnap = await fetchDailyKPISnapshot(supabase, prevDay, totalRoomsCount);

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

/**
 * Fetch revenue trend data based on selected time filter
 * 
 * Calculates date ranges and aggregates data by filter type.
 * 
 * @param filter Time period filter: 'daily' | 'weekly' | 'monthly' | 'yearly'
 * @returns Promise<RevenueDataPoint[]> Array of revenue data points
 * @throws Error if data fetching fails
 * 
 * Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 7.2, 14.1
 */
export async function fetchRevenueData(filter: RevenueFilter): Promise<RevenueDataPoint[]> {
    const supabase = createServerClient();
    const today = new Date();
    let startDate: Date;

    // Calculate date range based on filter
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

        // Aggregate data based on filter
        const aggregatedData = aggregateRevenueData(data, filter);

        return aggregatedData;
    } catch (error) {
        console.error('Error in fetchRevenueData:', error);
        throw new Error('Failed to fetch revenue data');
    }
}

/**
 * Fetch occupancy rate data for specified period
 * 
 * Calculates daily occupancy rates from transactions and lokasi_apartemen data.
 * Falls back to transaction-based calculation if the RPC function has issues.
 * 
 * @param days Number of days to fetch (default 30)
 * @returns Promise<OccupancyDataPoint[]> Array of occupancy data points
 * 
 * Requirements: 3.3, 3.4, 7.2, 14.4
 */
export async function fetchOccupancyData(days: number = 30): Promise<OccupancyDataPoint[]> {
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

        // Convert to OccupancyDataPoint array
        const result: OccupancyDataPoint[] = Array.from(dailyOccupancy.entries())
            .map(([date, rooms]) => ({
                date,
                occupancyRate: Math.round((rooms.size / totalRooms) * 10000) / 100,
                occupiedUnits: rooms.size,
                totalUnits: totalRooms,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return result;
    } catch (error) {
        console.error('Error in fetchOccupancyData:', error);
        return [];
    }
}
