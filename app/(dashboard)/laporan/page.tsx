import { fetchLaporanData, fetchHighOccupancyLocations } from './actions';
import type { DateFilter } from './actions';
import AIInsightCard from '@/components/ai/AIInsightCard';
import LaporanClient from '@/components/laporan/LaporanClient';
import { getReportPeriodSetting } from '@/lib/get-report-period-setting';
import { REPORT_PERIOD_DESCRIPTIONS } from '@/lib/reporting-period';

export default async function LaporanPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const filter = (typeof params.filter === 'string' ? params.filter : 'today') as DateFilter;

    const [data, highOccupancy] = await Promise.all([
        fetchLaporanData(filter),
        fetchHighOccupancyLocations(30),
    ]);

    const periodMode = await getReportPeriodSetting();
    const periodDesc = REPORT_PERIOD_DESCRIPTIONS[periodMode];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Laporan</h1>
                <p className="mt-1 text-xs sm:text-sm text-gray-500">Laporan keuangan & operasional (periode: {periodDesc})</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                <AIInsightCard
                    title="Insight Laporan"
                    prompt="Buat ringkasan laporan keuangan: total pendapatan, pengeluaran terbesar, lokasi terbaik, dan apakah ada tagihan yang belum dibayar. Berikan 1 rekomendasi. Maksimal 4 kalimat."
                />

                <LaporanClient data={data} highOccupancy={highOccupancy} />
            </main>
        </div>
    );
}
