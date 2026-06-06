'use server';

import { createServerClient } from '@/lib/supabase/server';
import { computeDateRange } from '@/lib/services/date-range';
import type { DateFilterParams } from '@/lib/services/date-range';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';

export interface CustomerItem {
    id: number;
    customerName: string;
    apartmentLocation: string;
    roomNumber: string;
    checkinAt: string | null;
    checkoutAt: string | null;
    cashAmount: number;
    transferAmount: number;
    totalAmount: number;
}

export interface CustomerListResult {
    items: CustomerItem[];
    totalCount: number;
}

export async function fetchCustomers(
    search?: string,
    page: number = 1,
    pageSize: number = 10,
    dateParams?: DateFilterParams,
): Promise<CustomerListResult> {
    const supabase = createServerClient();
    const offset = (page - 1) * pageSize;

    let query = supabase
        .from('transactions')
        .select('id, customer_name, apartment_location, room_number, checkin_at, checkout_at, cash_amount, transfer_amount', { count: 'exact' });

    if (search) {
        query = query.ilike('customer_name', `%${search}%`);
    }

    // Apply date filter if unified params provided — uses COALESCE(checkin_at, created_at)
    if (dateParams?.rangePreset) {
        const mode = await getReportPeriodSetting();
        const range = computeDateRange(dateParams.rangePreset, dateParams.startDate, dateParams.endDate, mode);
        query = query
            .or(`checkin_at.gte.${range.start},and(checkin_at.is.null,created_at.gte.${range.start})`)
            .lte('created_at', range.end);
    }

    const { data, count } = await query
        .order('checkin_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    const items: CustomerItem[] = (data || []).map((c: any) => ({
        id: c.id,
        customerName: c.customer_name || '',
        apartmentLocation: c.apartment_location || '',
        roomNumber: c.room_number || '',
        checkinAt: c.checkin_at || null,
        checkoutAt: c.checkout_at || null,
        cashAmount: c.cash_amount || 0,
        transferAmount: c.transfer_amount || 0,
        totalAmount: (c.cash_amount || 0) + (c.transfer_amount || 0),
    }));

    return { items, totalCount: count || 0 };
}

/**
 * Fetch all customers for export (no pagination)
 */
export async function fetchCustomersForExport(
    search?: string,
    dateParams?: DateFilterParams,
) {
    const supabase = createServerClient();

    let query = supabase
        .from('transactions')
        .select('id, customer_name, apartment_location, room_number, checkin_at, checkout_at, cash_amount, transfer_amount')
        .order('checkin_at', { ascending: false })
        .limit(5000);

    if (search) {
        query = query.ilike('customer_name', `%${search}%`);
    }

    if (dateParams?.rangePreset) {
        const mode = await getReportPeriodSetting();
        const range = computeDateRange(dateParams.rangePreset, dateParams.startDate, dateParams.endDate, mode);
        query = query
            .or(`checkin_at.gte.${range.start},and(checkin_at.is.null,created_at.gte.${range.start})`)
            .lte('created_at', range.end);
    }

    const { data } = await query;

    return (data || []).map((c: any) => ({
        customerName: c.customer_name || '',
        apartmentLocation: c.apartment_location || '',
        roomNumber: c.room_number || '',
        checkinAt: c.checkin_at || '',
        checkoutAt: c.checkout_at || '',
        cashAmount: c.cash_amount || 0,
        transferAmount: c.transfer_amount || 0,
        totalAmount: (c.cash_amount || 0) + (c.transfer_amount || 0),
    }));
}
