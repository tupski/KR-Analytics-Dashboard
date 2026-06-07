import { fetchUnits, fetchUnitLocations } from './actions';
import type { UnitDateFilter } from './actions';
import UnitOverview from '@/components/unit/UnitOverview';
import UnitLocationCards from '@/components/unit/UnitLocationCards';
import UnitGrid from '@/components/unit/UnitGrid';
import UnitStickyHeader from '@/components/unit/UnitStickyHeader';
import KraiInsightCard from '@/components/ai/KraiInsightCard';
import MetricCardHorizontal from '@/components/dashboard/MetricCardHorizontal';
import FilterBarWrapper from '@/components/shared/FilterBarWrapper';
import ExportButton from '@/components/shared/ExportButton';
import { Building, User, CheckCircle } from 'lucide-react';

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

    const occupancyRate = unitData.totalUnits > 0
        ? Math.round((unitData.occupiedToday / unitData.totalUnits) * 10000) / 100
        : 0;

    // For non-today filters, count rooms with period activity
    const roomsWithActivity = dateFilter !== 'today'
        ? unitData.units.filter(u => u.hasActivityInPeriod).length
        : unitData.occupiedToday;

    // Build data summary for contextual AI insights
    const unitDataSummary = {
        totalUnits: unitData.totalUnits,
        occupiedToday: unitData.occupiedToday,
        availableToday: unitData.availableToday,
        occupancyRate,
        roomsWithActivity,
        locationSummaries: unitData.locationSummaries.map(l => ({
            name: l.name,
            totalRooms: l.totalRooms,
            occupiedToday: l.occupiedToday,
            availableToday: l.availableToday,
            occupancyRate: l.occupancyRate,
        })),
        topOccupied: unitData.locationSummaries
            .filter(l => l.occupancyRate > 0)
            .sort((a, b) => b.occupancyRate - a.occupancyRate)
            .slice(0, 3),
        idleLocations: unitData.locationSummaries
            .filter(l => l.occupancyRate < 40)
            .map(l => l.name),
        periodLabel: dateFilter || rangePreset || 'Hari Ini',
    };

    const isNonToday = dateFilter !== 'today';

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
                </div>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* KraiInsightCard — collapsed by default, at very top */}
                <KraiInsightCard
                    pageContext="unit"
                    title="Insight Okupansi"
                    subtitle="Analisis performa unit dan okupansi"
                    defaultCollapsed={true}
                    dataSummary={unitDataSummary}
                />

                {/* Metric Cards — replacing UnitOverview */}
                <div className={`grid gap-3 sm:gap-4 ${isNonToday ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                    <MetricCardHorizontal
                        icon={<Building className="w-5 h-5" />}
                        title="Total Unit"
                        value={unitData.totalUnits}
                        isComparisonActive={false}
                        semanticType="neutral"
                    />
                    <MetricCardHorizontal
                        icon={<User className="w-5 h-5" />}
                        title={isNonToday ? 'Terisi (saat ini)' : 'Terisi'}
                        value={unitData.occupiedToday}
                        subtitle={isNonToday ? undefined : `${occupancyRate}% okupansi`}
                        isComparisonActive={false}
                        semanticType="occupancy"
                    />
                    <MetricCardHorizontal
                        icon={<CheckCircle className="w-5 h-5" />}
                        title="Tersedia"
                        value={unitData.availableToday}
                        isComparisonActive={false}
                        semanticType="neutral"
                    />
                    {isNonToday && (
                        <MetricCardHorizontal
                            icon={<User className="w-5 h-5" />}
                            title="Ada transaksi"
                            subtitle={dateFilter === '7days' ? '7 hari terakhir' : `periode ${dateFilter}`}
                            value={roomsWithActivity}
                            isComparisonActive={false}
                            semanticType="occupancy"
                        />
                    )}
                </div>

                {/* Filter Bar — StickyComparisonBar */}
                <div className="relative z-50 flex flex-wrap items-center justify-between gap-3">
                    <FilterBarWrapper
                        basePath="/unit"
                        rangePreset={rangePreset || dateFilter || 'today'}
                        startDate={startDate}
                        endDate={endDate}
                        comparisonMode={comparisonMode || 'none'}
                        comparisonStartDate={comparisonStartDate}
                        comparisonEndDate={comparisonEndDate}
                        extraPreservedParams={['location', 'filter']}
                    />
                    <ExportButton page="unit" label="Export Unit" />
                </div>

                {/* Location filter — simplified, no date pills */}
                <UnitStickyHeader
                    locations={locations}
                    currentLocation={locationFilter}
                />

                <UnitLocationCards summaries={unitData.locationSummaries} />
                <UnitGrid
                    units={unitData.units}
                    dateFilter={dateFilter}
                    periodStart={startDate}
                    periodEnd={endDate}
                    rangePreset={rangePreset}
                />
            </main>
        </div>
    );
}
