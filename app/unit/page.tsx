import { fetchUnits, fetchUnitLocations } from './actions';
import UnitOverview from '@/components/unit/UnitOverview';
import UnitLocationCards from '@/components/unit/UnitLocationCards';
import UnitGrid from '@/components/unit/UnitGrid';
import UnitLocationFilter from '@/components/unit/UnitLocationFilter';

/**
 * Unit Page - Server Component
 * 
 * Displays all apartment units with:
 * - Overview stats (total, occupied, available)
 * - Per-location summary cards with occupancy rates
 * - Grid view of all rooms with status indicators
 * - Filter by location
 * 
 * READ ONLY - no data modification
 */
export default async function UnitPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const locationFilter = typeof params.location === 'string' ? params.location : '';

    const [unitData, locations] = await Promise.all([
        fetchUnits(locationFilter || undefined),
        fetchUnitLocations(),
    ]);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Unit</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Kelola dan pantau status seluruh unit kamar Kakarama Room
                </p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* Overview Stats */}
                <UnitOverview
                    totalUnits={unitData.totalUnits}
                    occupiedToday={unitData.occupiedToday}
                    availableToday={unitData.availableToday}
                />

                {/* Location Summary Cards */}
                <UnitLocationCards summaries={unitData.locationSummaries} />

                {/* Filter */}
                <UnitLocationFilter
                    locations={locations}
                    currentLocation={locationFilter}
                />

                {/* Unit Grid */}
                <UnitGrid units={unitData.units} />
            </main>
        </div>
    );
}
