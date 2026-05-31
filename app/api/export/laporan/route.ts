import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { getDateRange } from '@/lib/services/date-range';
import { safeSerialize } from '@/lib/export/xlsx';
import { format } from 'date-fns';
import type { DateFilter } from '@/app/(dashboard)/laporan/actions';

export async function GET(request: Request) {
    try {
        const supabase = createServerClient();
        const { searchParams } = new URL(request.url);

        const rawFilter = searchParams.get('filter') || 'today';
        const filter = rawFilter as DateFilter;
        const { start, end } = getDateRange(filter);

        // Fetch expenses
        const { data, error } = await supabase
            .from('pengeluaran')
            .select('id, nama_pengeluaran, jumlah, tanggal, keterangan, apartment_location, room_number, category')
            .gte('tanggal', start.split('T')[0])
            .lte('tanggal', end.split('T')[0])
            .order('tanggal', { ascending: false });

        if (error) {
            console.error('[EXPORT LAPORAN]', error);
            return NextResponse.json({ error: 'Gagal mengambil data laporan.' }, { status: 500 });
        }

        const rows = (data || []).map((e: any) => ({
            tanggal: e.tanggal || '',
            category: e.category || 'Lainnya',
            namaPengeluaran: e.nama_pengeluaran || '',
            jumlah: e.jumlah || 0,
            apartmentLocation: e.apartment_location || '',
            roomNumber: e.room_number || '',
            keterangan: e.keterangan || '',
        }));

        const safeRows = safeSerialize(rows.length ? rows : [{ tanggal: 'Tidak ada data' }]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(safeRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Pengeluaran');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const today = format(new Date(), 'yyyy-MM-dd');
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="kr-analytics-laporan-${today}.xlsx"`,
            },
        });
    } catch (error) {
        console.error('[EXPORT LAPORAN]', error);
        return NextResponse.json(
            { error: 'Export gagal. Silakan cek log server.' },
            { status: 500 }
        );
    }
}
