import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { computeDateRange } from '@/lib/services/date-range';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import { safeSerialize } from '@/lib/export/xlsx';
import { format } from 'date-fns';

export async function GET(request: Request) {
    try {
        const supabase = createServerClient();
        const { searchParams } = new URL(request.url);

        const search = searchParams.get('search') || undefined;
        const rangePreset = searchParams.get('rangePreset') || undefined;
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;

        let query = supabase
            .from('transactions')
            .select('id, customer_name, apartment_location, room_number, checkin_at, checkout_at, cash_amount, transfer_amount')
            .order('checkin_at', { ascending: false })
            .limit(5000);

        if (search) {
            query = query.ilike('customer_name', `%${search}%`);
        }

        if (rangePreset) {
            const mode = await getReportPeriodSetting();
            const range = computeDateRange(rangePreset, startDate, endDate, mode);
            query = query.gte('checkin_at', range.start).lte('checkin_at', range.end);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[EXPORT CUSTOMER]', error);
            return NextResponse.json({ error: 'Gagal mengambil data customer.' }, { status: 500 });
        }

        const rows = (data || []).map((c: any) => ({
            customerName: c.customer_name || '',
            apartmentLocation: c.apartment_location || '',
            roomNumber: c.room_number || '',
            checkinAt: c.checkin_at || '',
            checkoutAt: c.checkout_at || '',
            cashAmount: c.cash_amount || 0,
            transferAmount: c.transfer_amount || 0,
            totalAmount: (c.cash_amount || 0) + (c.transfer_amount || 0),
        }));

        const safeRows = safeSerialize(rows.length ? rows : [{ customerName: 'Tidak ada data' }]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(safeRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Customer');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const today = format(new Date(), 'yyyy-MM-dd');
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="kr-analytics-customer-${today}.xlsx"`,
            },
        });
    } catch (error) {
        console.error('[EXPORT CUSTOMER]', error);
        return NextResponse.json(
            { error: 'Export gagal. Silakan cek log server.' },
            { status: 500 }
        );
    }
}
