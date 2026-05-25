import { fetchUnits, fetchUnitLocations } from './actions';
import type { UnitDateFilter } from './actions';
import UnitOverview from '@/components/unit/UnitOverview';
import UnitLocationCards from '@/components/unit/UnitLocationCards';
import UnitGrid from '@/components/unit/UnitGrid';
import UnitStickyHeader from '@/components/unit/UnitStickyHeader';
import AIInsightCard from '@/components/ai/AIInsightCard';

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

    const [unitData, locations] = await Promise.all([
        fetchUnits(locationFilter || undefined, dateFilter),
        fetchUnitLocations(),
    ]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Unit</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Kelola dan pantau status seluruh unit kamar Kakarama Room
                </p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* Sticky filter header — visible on all device sizes */}
                <UnitStickyHeader
                    locations={locations}
                    currentLocation={locationFilter}
                    currentFilter={dateFilter}
                    dateLabel={unitData.dateLabel}
                />

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
