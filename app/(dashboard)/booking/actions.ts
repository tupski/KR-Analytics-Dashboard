'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getLocations } from '@/lib/services/location';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getTodayReportRange } from '@/lib/get-report-period-setting';

export interface BookingItem {
    id: number;
    customerName: string;
    apartmentLocation: string;
    roomNumber: string;
    checkinAt: string;
    checkoutAt: string;
    rentalDuration: number;
    cashAmount: number;
    transferAmount: number;
    totalAmount: number;
    marketingName: string | null;
    shift: string | null;
    inputBy: string | null;
    createdAt: string;
}

export interface BookingFilters {
    search?: string;
    location?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
}

export interface BookingListResult {
    items: BookingItem[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

/**
 * Fetch paginated booking list with filters
 * READ ONLY - no data modification
 */
export async function fetchBookings(filters: BookingFilters = {}): Promise<BookingListResult> {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    try {
        let query = supabase
            .from('transactions')
            .select('*', { count: 'exact' });

        // Apply search filter
        if (filters.search) {
            query = query.or(`customer_name.ilike.%${filters.search}%,room_number.ilike.%${filters.search}%`);
        }

        // Apply location filter
        if (filters.location) {
            query = query.eq('apartment_location', filters.location);
        }

        // Apply date range filter
        if (filters.dateFrom) {
            query = query.gte('checkin_at', `${filters.dateFrom}T00:00:00`);
        }
        if (filters.dateTo) {
            query = query.lte('checkin_at', `${filters.dateTo}T23:59:59`);
        }

        // Order and paginate
        query = query
            .order('checkin_at', { ascending: false })
            .range(offset, offset + pageSize - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error('Error fetching bookings:', error);
            throw new Error(`Failed to fetch bookings: ${error.message}`);
        }

        const items: BookingItem[] = (data || []).map((tx: any) => ({
            id: tx.id,
            customerName: tx.customer_name || '',
            apartmentLocation: tx.apartment_location || '',
            roomNumber: tx.room_number || '',
            checkinAt: tx.checkin_at || '',
            checkoutAt: tx.checkout_at || '',
            rentalDuration: tx.rental_duration || 0,
            cashAmount: tx.cash_amount || 0,
            transferAmount: tx.transfer_amount || 0,
            totalAmount: (tx.cash_amount || 0) + (tx.transfer_amount || 0),
            marketingName: tx.marketing_name,
            shift: tx.shift,
            inputBy: tx.input_by,
            createdAt: tx.created_at || '',
        }));

        const totalCount = count || 0;

        return {
            items,
            totalCount,
            page,
            pageSize,
            totalPages: Math.ceil(totalCount / pageSize),
        };
    } catch (error) {
        console.error('Error in fetchBookings:', error);
        throw new Error('Failed to fetch bookings');
    }
}

/**
 * Fetch all available locations for filter dropdown
 * READ ONLY
 */
export async function fetchLocations(): Promise<string[]> {
    const locations = await getLocations();
    return locations.map(loc => loc.name);
}

/**
 * Fetch booking statistics summary
 * READ ONLY
 */
export async function fetchBookingStats() {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

    try {
        // Today's bookings count — use report period setting
        const { start: todayStart, end: todayEnd } = await getTodayReportRange();

        const { count: todayCount } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .gte('checkin_at', todayStart)
            .lte('checkin_at', todayEnd);

        // This week's bookings (same range start)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = format(toZonedTime(weekAgo, timezone), 'yyyy-MM-dd');

        const { count: weekCount } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .gte('checkin_at', `${weekAgoStr}T00:00:00`);

        // This month's bookings (month-aligned, not period-dependent)
        const monthStart = format(toZonedTime(new Date(), timezone), 'yyyy-MM-01');

        const { count: monthCount } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .gte('checkin_at', `${monthStart}T00:00:00`);

        // Total revenue this month
        const { data: monthRevenue } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', `${monthStart}T00:00:00`);

        const totalMonthRevenue = monthRevenue?.reduce(
            (sum: number, t: any) => sum + (t.cash_amount || 0) + (t.transfer_amount || 0), 0
        ) || 0;

        return {
            todayCount: todayCount || 0,
            weekCount: weekCount || 0,
            monthCount: monthCount || 0,
            monthRevenue: totalMonthRevenue,
        };
    } catch (error) {
        console.error('Error in fetchBookingStats:', error);
        return { todayCount: 0, weekCount: 0, monthCount: 0, monthRevenue: 0 };
    }
}
