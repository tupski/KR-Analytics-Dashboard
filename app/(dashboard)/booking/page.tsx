import { fetchBookings, fetchLocations, fetchBookingStats } from './actions';
import BookingTable from '@/components/booking/BookingTable';
import BookingStatsCards from '@/components/booking/BookingStatsCards';
import BookingFilters from '@/components/booking/BookingFilters';
import DateFilterBar from '@/components/shared/DateFilterBar';
import AIInsightCard from '@/components/ai/AIInsightCard';
import ReportPeriodChip from '@/components/shared/ReportPeriodChip';
import ExportButton from '@/components/shared/ExportButton';

/**
 * Booking Page - Server Component
 *
 * Displays a paginated list of all bookings/transactions with:
 * - Summary stats cards (today, week, month, revenue)
 * - Filter by search, location, date range
 * - Sortable table with booking details
 * - Pagination
 *
 * Accepts unified date filter params for flexible date range + comparison.
 * READ ONLY - no data modification
 */
export default async function BookingPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const search = typeof params.search === 'string' ? params.search : '';
    const location = typeof params.location === 'string' ? params.location : '';
    const dateFrom = typeof params.dateFrom === 'string' ? params.dateFrom : '';
    const dateTo = typeof params.dateTo === 'string' ? params.dateTo : '';
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;

    // Unified date filter params
    const rangePreset = typeof params.rangePreset === 'string' ? params.rangePreset : undefined;
    const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
    const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
    const comparisonMode = typeof params.comparisonMode === 'string' ? params.comparisonMode : undefined;
    const comparisonStartDate = typeof params.comparisonStartDate === 'string' ? params.comparisonStartDate : undefined;
    const comparisonEndDate = typeof params.comparisonEndDate === 'string' ? params.comparisonEndDate : undefined;

    const [bookingResult, locations, stats] = await Promise.all([
        fetchBookings({
            search,
            location,
            dateFrom,
            dateTo,
            page,
            pageSize: 20,
            // Pass unified date params to the action
            rangePreset,
            startDate,
            endDate,
        }),
        fetchLocations(),
        fetchBookingStats(),
    ]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Booking</h1>
                        <p className="mt-1 text-xs sm:text-sm text-gray-500">
                            Daftar semua transaksi booking Kakarama Room
                        </p>
                    </div>
                    <ReportPeriodChip className="hidden sm:inline-flex mt-1 flex-shrink-0" />
                </div>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* Export + AI Insight */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <ExportButton page="booking" label="Export Booking" />
                </div>

                {/* AI Insight - Top */}
                <AIInsightCard
                    title="Insight Booking"
                    prompt="Analisis tren booking: bandingkan jumlah booking hari ini vs rata-rata harian bulan ini. Sebutkan lokasi paling aktif dan jam check-in tersibuk. Maksimal 3 kalimat."
                />

                {/* Stats Cards */}
                <BookingStatsCards stats={stats} />

                {/* Date Filter Bar — unified date range + comparison */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <DateFilterBar
                        basePath="/booking"
                        defaultPreset={rangePreset as any || 'last30days'}
                        defaultStartDate={startDate}
                        defaultEndDate={endDate}
                        defaultComparisonMode={comparisonMode as any || 'none'}
                        defaultComparisonStartDate={comparisonStartDate}
                        defaultComparisonEndDate={comparisonEndDate}
                        extraPreservedParams={['search', 'location', 'page', 'pageSize']}
                    />
                </div>

                {/* Filters */}
                <BookingFilters
                    locations={locations}
                    currentSearch={search}
                    currentLocation={location}
                    currentDateFrom={dateFrom}
                    currentDateTo={dateTo}
                />

                {/* Table */}
                <BookingTable
                    items={bookingResult.items}
                    totalCount={bookingResult.totalCount}
                    page={bookingResult.page}
                    pageSize={bookingResult.pageSize}
                    totalPages={bookingResult.totalPages}
                />
            </main>
        </div>
    );
}
