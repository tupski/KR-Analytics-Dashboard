import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createServerClient } from '@/lib/supabase/server';
import { getRevenueTrend } from '@/lib/services/revenue';
import { getDailyOccupancyTrend } from '@/lib/services/occupancy';
import { format } from 'date-fns';
import { safeSerialize, formatRupiah } from '@/lib/export/xlsx';
import { getReportPeriodRange } from '@/lib/shared/report-period';

export async function GET(request: Request) {
    try {
        const supabase = createServerClient();
        const { searchParams } = new URL(request.url);

        // Fetch revenue data (last 30 days daily)
        const revenuePeriod = getReportPeriodRange({ preset: 'last_30_days', timezone: 'Asia/Jakarta' });
        const now = new Date();

        const [revenueTrend, occupancyTrend] = await Promise.all([
            getRevenueTrend(revenuePeriod),
            getDailyOccupancyTrend(30),
        ]);

        // Build revenue sheet data
        const revData = (revenueTrend || []).map(point => ({
            date: format(new Date(point.date), 'dd MMM yyyy'),
            grossRevenue: point.revenue || 0,
            platformFee: 0,
            netRevenue: point.revenue || 0,
            transactionCount: point.transactionCount || 0,
        }));

        // Build occupancy sheet data
        const occData = (occupancyTrend || []).map(point => ({
            date: format(new Date(point.date), 'dd MMM yyyy'),
            totalUnits: point.totalUnits || 0,
            occupiedUnits: point.occupiedUnits || 0,
            availableUnits: (point.totalUnits || 0) - (point.occupiedUnits || 0),
            occupancyRate: point.occupancyRate || 0,
        }));

        const wb = XLSX.utils.book_new();

        // Sheet 1: Pendapatan
        const safeRev = safeSerialize(revData.length ? revData : [{ date: 'Tidak ada data', grossRevenue: '', platformFee: '', netRevenue: '', transactionCount: '' }]);
        const ws1 = XLSX.utils.json_to_sheet(safeRev);
        XLSX.utils.book_append_sheet(wb, ws1, 'Pendapatan');

        // Sheet 2: Okupansi
        const safeOcc = safeSerialize(occData.length ? occData : [{ date: 'Tidak ada data', totalUnits: '', occupiedUnits: '', availableUnits: '', occupancyRate: '' }]);
        const ws2 = XLSX.utils.json_to_sheet(safeOcc);
        XLSX.utils.book_append_sheet(wb, ws2, 'Okupansi');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const today = format(now, 'yyyy-MM-dd');
        return new NextResponse(buf, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="kr-analytics-dashboard-${today}.xlsx"`,
            },
        });
    } catch (error) {
        console.error('[EXPORT DASHBOARD]', error);
        return NextResponse.json(
            { error: 'Export gagal. Silakan cek log server.' },
            { status: 500 }
        );
    }
}
