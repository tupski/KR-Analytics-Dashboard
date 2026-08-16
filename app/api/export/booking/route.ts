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

        // Pass filter params through
        const rangePreset = searchParams.get('rangePreset') || undefined;
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;
        const search = searchParams.get('search') || undefined;
        const location = searchParams.get('location') || undefined;

        // M3: require a date range — unbounded exports are rejected.
        if (!rangePreset) {
            return NextResponse.json(
                { error: 'Rentang tanggal wajib diisi untuk export booking.' },
                { status: 400 },
            );
        }

        // Build query — explicit columns (blob columns ktp_image_url/transfer_proof_url dropped), capped at 20,000 rows.
        let query = supabase
            .from('transactions')
            .select('id, customer_name, apartment_location, room_number, checkin_at, checkout_at, rental_duration, cash_amount, transfer_amount, marketing_name, shift')
            .limit(20000);

        if (search) {
            query = query.or(`customer_name.ilike.%${search}%,room_number.ilike.%${search}%`);
        }
        if (location) {
            query = query.eq('apartment_location', location);
        }

        // Apply date range
        const mode = await getReportPeriodSetting();
        const range = computeDateRange(rangePreset, startDate, endDate, mode);
        query = query.gte('checkin_at', range.start).lte('checkin_at', range.end);

        query = query.order('checkin_at', { ascending: false });

        const { data, error } = await query;

        if (error) {
            console.error('[EXPORT BOOKING]', error);
            return NextResponse.json({ error: 'Gagal mengambil data booking.' }, { status: 500 });
        }

        const rows = (data || []).map((tx: any) => ({
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

        const safeRows = safeSerialize(rows.length ? rows : [{ bookingNumber: 'Tidak ada data' }]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(safeRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Booking');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const today = format(new Date(), 'yyyy-MM-dd');
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="kr-analytics-booking-${today}.xlsx"`,
            },
        });
    } catch (error) {
        console.error('[EXPORT BOOKING]', error);
        return NextResponse.json(
            { error: 'Export gagal. Silakan cek log server.' },
            { status: 500 }
        );
    }
}
