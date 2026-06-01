import { fetchLaporanData, fetchHighOccupancyLocations } from './actions';
import type { DateFilter } from './actions';
import KraiInsightCard from '@/components/ai/KraiInsightCard';
import LaporanClient from '@/components/laporan/LaporanClient';
import FilterBarWrapper from '@/components/shared/FilterBarWrapper';
import ExportButton from '@/components/shared/ExportButton';

export default async function LaporanPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const filter = (typeof params.filter === 'string' ? params.filter : 'today') as DateFilter;

    // Unified date filter params
    const rangePreset = typeof params.rangePreset === 'string' ? params.rangePreset : undefined;
    const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
    const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
    const comparisonMode = typeof params.comparisonMode === 'string' ? params.comparisonMode : undefined;
    const comparisonStartDate = typeof params.comparisonStartDate === 'string' ? params.comparisonStartDate : undefined;
    const comparisonEndDate = typeof params.comparisonEndDate === 'string' ? params.comparisonEndDate : undefined;

    const dateParams = rangePreset ? { rangePreset, startDate, endDate, comparisonMode, comparisonStartDate, comparisonEndDate } : undefined;

    const [data, highOccupancy] = await Promise.all([
        fetchLaporanData(filter, dateParams),
        fetchHighOccupancyLocations(30),
    ]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Laporan</h1>
                        <p className="mt-1 text-xs sm:text-sm text-gray-500">Laporan keuangan & operasional</p>
                    </div>
                </div>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* KraiInsightCard — collapsed by default, at very top */}
                <KraiInsightCard
                    pageContext="laporan"
                    title="Insight Laporan"
                    subtitle="Analisis laporan keuangan dan pengeluaran"
                    defaultCollapsed={true}
                />

                {/* Filter Bar + Export */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <FilterBarWrapper
                        basePath="/laporan"
                        rangePreset={rangePreset || filter || 'today'}
                        startDate={startDate}
                        endDate={endDate}
                        comparisonMode={comparisonMode || 'none'}
                        comparisonStartDate={comparisonStartDate}
                        comparisonEndDate={comparisonEndDate}
                        extraPreservedParams={['filter']}
                    />
                    <ExportButton page="laporan" label="Export Laporan" />
                </div>

                <LaporanClient data={data} highOccupancy={highOccupancy} />
            </main>
        </div>
    );
}
