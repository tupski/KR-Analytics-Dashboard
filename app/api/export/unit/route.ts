import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { computeDateRange, getDateRange } from '@/lib/services/date-range';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import { safeSerialize } from '@/lib/export/xlsx';
import { format } from 'date-fns';
import type { UnitDateFilter } from '@/app/(dashboard)/unit/actions';

export async function GET(request: Request) {
    try {
        const supabase = createServerClient();
        const { searchParams } = new URL(request.url);

        const locationFilter = searchParams.get('location') || undefined;
        const rawFilter = searchParams.get('filter') || 'today';

        // Fetch all rooms — explicit columns only (blob columns dropped).
        let roomQuery = supabase
            .from('nomor_kamar')
            .select('id, name, lokasi, status')
            .order('lokasi')
            .order('name');

        if (locationFilter) {
            roomQuery = roomQuery.eq('lokasi', locationFilter);
        }

        const { data: rooms } = await roomQuery;

        // Determine date range
        const mode = await getReportPeriodSetting();
        const rangePreset = searchParams.get('rangePreset') || undefined;
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;

        const range = rangePreset
            ? computeDateRange(rangePreset, startDate, endDate, mode)
            : getDateRange(rawFilter as UnitDateFilter, mode);

        // Get occupancy data
        const occupiedMap = new Map<string, string>();
        const occupancyCountMap = new Map<string, number>();

        // M3: bounded period-tx scan (20,000 row cap) — same dataset as unit/actions period-overlap.
        const { data: periodTx } = await supabase
            .from('transactions')
            .select('room_number, apartment_location, customer_name, checkin_at')
            .gte('checkin_at', range.start)
            .lte('checkin_at', range.end)
            .order('checkin_at', { ascending: false })
            .limit(20000);

        periodTx?.forEach((tx: any) => {
            const key = `${tx.apartment_location}-${tx.room_number}`;
            if (!occupiedMap.has(key)) occupiedMap.set(key, tx.customer_name);
            occupancyCountMap.set(key, (occupancyCountMap.get(key) || 0) + 1);
        });

        // Build unit rows
        const unitRows = (rooms || []).map((room: any) => {
            const key = `${room.lokasi}-${room.name}`;
            const isOccupied = occupiedMap.has(key);
            return {
                name: room.name,
                lokasi: room.lokasi,
                status: room.status,
                isOccupiedToday: isOccupied ? 'Ya' : 'Tidak',
                currentGuest: isOccupied ? occupiedMap.get(key) : '',
                occupancyCount: occupancyCountMap.get(key) || 0,
            };
        });

        // Build location summaries
        const locMap = new Map<string, { total: number; occupied: number }>();
        (rooms || []).forEach((room: any) => {
            const key = room.lokasi;
            const existing = locMap.get(key) || { total: 0, occupied: 0 };
            existing.total++;
            if (occupiedMap.has(`${room.lokasi}-${room.name}`)) existing.occupied++;
            locMap.set(key, existing);
        });

        const summaryRows = Array.from(locMap.entries()).map(([name, data]) => ({
            location: name,
            totalRooms: data.total,
            occupiedToday: data.occupied,
            availableToday: data.total - data.occupied,
            occupancyRate: data.total > 0 ? Math.round((data.occupied / data.total) * 10000) / 100 : 0,
        }));

        const wb = XLSX.utils.book_new();

        const safeUnits = safeSerialize(unitRows.length ? unitRows : [{ name: 'Tidak ada data' }]);
        const ws1 = XLSX.utils.json_to_sheet(safeUnits);
        XLSX.utils.book_append_sheet(wb, ws1, 'Unit');

        const safeSummaries = safeSerialize(summaryRows.length ? summaryRows : [{ location: 'Tidak ada data' }]);
        const ws2 = XLSX.utils.json_to_sheet(safeSummaries);
        XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan Lokasi');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const today = format(new Date(), 'yyyy-MM-dd');
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="kr-analytics-unit-${today}.xlsx"`,
            },
        });
    } catch (error) {
        console.error('[EXPORT UNIT]', error);
        return NextResponse.json(
            { error: 'Export gagal. Silakan cek log server.' },
            { status: 500 }
        );
    }
}
