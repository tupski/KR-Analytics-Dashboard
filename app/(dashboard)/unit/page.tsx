import { fetchUnits, fetchUnitLocations } from './actions';
import type { UnitDateFilter } from './actions';
import UnitOverview from '@/components/unit/UnitOverview';
import UnitLocationCards from '@/components/unit/UnitLocationCards';
import UnitGrid from '@/components/unit/UnitGrid';
import UnitStickyHeader from '@/components/unit/UnitStickyHeader';
import DateFilterBar from '@/components/shared/DateFilterBar';
import AIInsightCard from '@/components/ai/AIInsightCard';
import ReportPeriodChip from '@/components/shared/ReportPeriodChip';
import ExportButton from '@/components/shared/ExportButton';
import { exportToXLSX, getExportFilename, type ExportSheet } from '@/lib/export/xlsx';

const VALID_FILTERS: UnitDateFilter[] = ['today', 'yesterday', '7days', 'month', 'year'];

export default async function UnitPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const locationFilter = typeof params.location === 'string' ? params.location : '';
    const rawFilter = typeof params.filter === 'string' ? params.filter : 'today';
    const dateFilter = (VALID_FILTERS.includes(rawFilter as UnitDateFilter) ? rawFilter : 'today') as UnitDateFilter;

    // Unified date filter params
    const rangePreset = typeof params.rangePreset === 'string' ? params.rangePreset : undefined;
    const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
    const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
    const comparisonMode = typeof params.comparisonMode === 'string' ? params.comparisonMode : undefined;
    const comparisonStartDate = typeof params.comparisonStartDate === 'string' ? params.comparisonStartDate : undefined;
    const comparisonEndDate = typeof params.comparisonEndDate === 'string' ? params.comparisonEndDate : undefined;

    const dateParams = rangePreset ? { rangePreset, startDate, endDate, comparisonMode, comparisonStartDate, comparisonEndDate } : undefined;

    const [unitData, locations] = await Promise.all([
        fetchUnits(locationFilter || undefined, dateFilter, dateParams),
        fetchUnitLocations(),
    ]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Unit</h1>
                        <p className="mt-1 text-xs sm:text-sm text-gray-500">
                            Kelola dan pantau status seluruh unit kamar Kakarama Room
                        </p>
                    </div>
                    <ReportPeriodChip className="hidden sm:inline-flex mt-1 flex-shrink-0" />
                </div>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* Date Filter Bar — unified date range + comparison */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <DateFilterBar
                        basePath="/unit"
                        defaultPreset={rangePreset as any || dateFilter as any || 'today'}
                        defaultStartDate={startDate}
                        defaultEndDate={endDate}
                        defaultComparisonMode={comparisonMode as any || 'none'}
                        defaultComparisonStartDate={comparisonStartDate}
                        defaultComparisonEndDate={comparisonEndDate}
                        extraPreservedParams={['location', 'filter']}
                    />
                </div>

                {/* Sticky filter header — visible on all device sizes */}
                <UnitStickyHeader
                    locations={locations}
                    currentLocation={locationFilter}
                    currentFilter={dateFilter}
                    dateLabel={unitData.dateLabel}
                />

                {/* Export Button */}
                <div className="flex justify-end mb-2">
                    <ExportButton
                        onExport={async () => {
                            'use server';
                            const unitData = await fetchUnits(undefined, dateFilter);

                            const sheets: ExportSheet[] = [
                                {
                                    name: 'Unit',
                                    columns: [
                                        { header: 'Nama Unit', key: 'name' },
                                        { header: 'Lokasi', key: 'lokasi' },
                                        { header: 'Status', key: 'status' },
                                        { header: 'Terisi Hari Ini', key: 'isOccupiedToday', format: (v: boolean) => v ? 'Ya' : 'Tidak' },
                                        { header: 'Tamu Saat Ini', key: 'currentGuest' },
                                        { header: 'Jumlah Booking', key: 'occupancyCount' },
                                    ],
                                    data: unitData.units,
                                },
                                {
                                    name: 'Ringkasan Lokasi',
                                    columns: [
                                        { header: 'Lokasi', key: 'name' },
                                        { header: 'Total Kamar', key: 'totalRooms' },
                                        { header: 'Terisi', key: 'occupiedToday' },
                                        { header: 'Tersedia', key: 'availableToday' },
                                        { header: 'Okupansi (%)', key: 'occupancyRate', format: (v: number) => `${v}%` },
                                    ],
                                    data: unitData.locationSummaries,
                                },
                            ];

                            const filename = getExportFilename('unit');
                            return { sheets, filename };
                        }}
                        label="Export Unit"
                    />
                </div>

                {/* AI Insight - Top */}
                <AIInsightCard
                    title="Insight Okupansi"
                    prompt="Analisis okupansi unit: sebutkan lokasi dengan okupansi tertinggi dan terendah, serta rekomendasi untuk meningkatkan okupansi. Maksimal 3 kalimat."
                />

                <UnitOverview
                    totalUnits={unitData.totalUnits}
                    occupiedToday={unitData.occupiedToday}
                    availableToday={unitData.availableToday}
                />

                <UnitLocationCards summaries={unitData.locationSummaries} />

                <UnitGrid units={unitData.units} dateFilter={dateFilter} />
            </main>
        </div>
    );
}
