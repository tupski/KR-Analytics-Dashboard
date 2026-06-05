'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getRevenueSummary as getServiceRevenueSummary } from '@/lib/services/revenue';
import { getLocations } from '@/lib/services/location';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getReportPeriodSetting, getTodayReportRange } from '@/lib/get-report-period-setting';
import { getReportPeriodRange } from '@/lib/reporting-period';
import { computeDateRange, computeComparisonRange } from '@/lib/services/date-range';
import type { DateFilterParams } from '@/lib/services/date-range';

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
    // Unified date filter params
    rangePreset?: string;
    startDate?: string;
    endDate?: string;
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

        // Apply date range filter — support both legacy dateFrom/dateTo and unified rangePreset
        let rangeStart: string | undefined;
        let rangeEnd: string | undefined;

        if (filters.rangePreset) {
            const mode = await getReportPeriodSetting();
            const range = computeDateRange(filters.rangePreset, filters.startDate, filters.endDate, mode);
            rangeStart = range.start;
            rangeEnd = range.end;
        } else {
            if (filters.dateFrom) {
                const mode = await getReportPeriodSetting();
                const range = getReportPeriodRange(filters.dateFrom, mode);
                rangeStart = range.start;
            }
            if (filters.dateTo) {
                const mode = await getReportPeriodSetting();
                const range = getReportPeriodRange(filters.dateTo, mode);
                rangeEnd = range.end;
            }
        }

        if (rangeStart) {
            query = query.gte('checkin_at', rangeStart);
        }
        if (rangeEnd) {
            query = query.lte('checkin_at', rangeEnd);
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
 * Fetch booking statistics summary — supports unified date params + comparison.
 */
export async function fetchBookingStats(dateParams?: DateFilterParams) {
    const supabase = createServerClient();

    // Determine main range from dateParams or fall back to today
    const mode = await getReportPeriodSetting();
    const range = dateParams?.rangePreset
        ? computeDateRange(dateParams.rangePreset, dateParams.startDate, dateParams.endDate, mode)
        : await getTodayReportRange();

    // Main period stats
    const { count: bookingCount } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .gte('checkin_at', range.start)
        .lte('checkin_at', range.end);

    const revenueData = await getServiceRevenueSummary(range.start, range.end);
    const totalRevenue = revenueData.totalRevenue;
    const totalTransactions = revenueData.transactionCount;

    // Average per day (for subtitle)
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);
    const dayCount = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));

    // Compute comparison range
    let comparison: {
        prevBookingCount: number;
        prevRevenue: number;
        prevLabel: string;
    } | null = null;

    if (dateParams?.comparisonMode && dateParams.comparisonMode !== 'none') {
        const cr = computeComparisonRange(
            dateParams.comparisonMode,
            range.start,
            range.end,
            dateParams.comparisonStartDate,
            dateParams.comparisonEndDate,
            mode,
        );
        if (cr) {
            const { count: prevCount } = await supabase
                .from('transactions')
                .select('id', { count: 'exact', head: true })
                .gte('checkin_at', cr.start)
                .lte('checkin_at', cr.end);

            const prevRevData = await getServiceRevenueSummary(cr.start, cr.end);
            const prevRevenue = prevRevData.totalRevenue;

            comparison = {
                prevBookingCount: prevCount || 0,
                prevRevenue,
                prevLabel: cr.label,
            };
        }
    }

    return {
        bookingCount: bookingCount || 0,
        totalRevenue,
        totalTransactions,
        avgPerDay: dayCount > 0 ? totalRevenue / dayCount : 0,
        comparison,
        rangeLabel: 'label' in range ? (range as any).label : dateParams?.rangePreset || 'Periode ini',
    };
}

/**
 * Fetch all bookings for export (no pagination limit)
 * Respects the same filters as fetchBookings
 */
export async function fetchBookingsForExport(filters: BookingFilters = {}) {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';

    try {
        let query = supabase
            .from('transactions')
            .select('*');

        if (filters.search) {
            query = query.or(`customer_name.ilike.%${filters.search}%,room_number.ilike.%${filters.search}%`);
        }
        if (filters.location) {
            query = query.eq('apartment_location', filters.location);
        }
        // Apply date range filter
        let rangeStart: string | undefined;
        let rangeEnd: string | undefined;

        if (filters.rangePreset) {
            const mode = await getReportPeriodSetting();
            const range = computeDateRange(filters.rangePreset, filters.startDate, filters.endDate, mode);
            rangeStart = range.start;
            rangeEnd = range.end;
        } else {
            if (filters.dateFrom) {
                const mode = await getReportPeriodSetting();
                const range = getReportPeriodRange(filters.dateFrom, mode);
                rangeStart = range.start;
            }
            if (filters.dateTo) {
                const mode = await getReportPeriodSetting();
                const range = getReportPeriodRange(filters.dateTo, mode);
                rangeEnd = range.end;
            }
        }

        if (rangeStart) {
            query = query.gte('checkin_at', rangeStart);
        }
        if (rangeEnd) {
            query = query.lte('checkin_at', rangeEnd);
        }

        query = query.order('checkin_at', { ascending: false });

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching bookings for export:', error);
            return [];
        }

        return (data || []).map((tx: any) => ({
            bookingNumber: `TRX-${tx.id}`,
            customerName: tx.customer_name || '',
            apartmentLocation: tx.apartment_location || '',
            roomNumber: tx.room_number || '',
            checkinAt: tx.checkin_at || '',
            checkoutAt: tx.checkout_at || '',
            rentalDuration: tx.rental_duration || 0,
            cashAmount: tx.cash_amount || 0,
            transferAmount: tx.transfer_amount || 0,
            totalAmount: (tx.cash_amount || 0) + (tx.transfer_amount || 0),
            marketingName: tx.marketing_name || 'Tidak Diketahui',
            shift: tx.shift || '-',
            status: tx.checkout_at ? 'Selesai' : 'Aktif',
        }));
    } catch (error) {
        console.error('Error in fetchBookingsForExport:', error);
        return [];
    }
}
