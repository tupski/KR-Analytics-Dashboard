import { fetchBookings, fetchLocations, fetchBookingStats } from './actions';
import BookingTable from '@/components/booking/BookingTable';
import BookingFilters from '@/components/booking/BookingFilters';
import MetricCardHorizontal from '@/components/dashboard/MetricCardHorizontal';
import KraiInsightCard from '@/components/ai/KraiInsightCard';
import FilterBarWrapper from '@/components/shared/FilterBarWrapper';
import ExportButton from '@/components/shared/ExportButton';
import { Calendar, CalendarDays, DollarSign, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

/**
 * Booking Page - Server Component
 *
 * Uses KraiInsightCard at top (collapsed by default),
 * MetricCardHorizontal for stats, StickyComparisonBar for filter.
 * Keeps BookingFilters (search/location) but removes duplicate date filter.
 */
export default async function BookingPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const search = typeof params.search === 'string' ? params.search : '';
    const location = typeof params.location === 'string' ? params.location : '';
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;

    // Unified date filter params
    const rangePreset = typeof params.rangePreset === 'string' ? params.rangePreset : undefined;
    const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
    const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
    const comparisonMode = typeof params.comparisonMode === 'string' ? params.comparisonMode : undefined;
    const comparisonStartDate = typeof params.comparisonStartDate === 'string' ? params.comparisonStartDate : undefined;
    const comparisonEndDate = typeof params.comparisonEndDate === 'string' ? params.comparisonEndDate : undefined;

    const dateParams = rangePreset ? { rangePreset, startDate, endDate, comparisonMode, comparisonStartDate, comparisonEndDate } : undefined;

    const [bookingResult, locations, stats] = await Promise.all([
        fetchBookings({
            search,
            location,
            page,
            pageSize: 20,
            rangePreset,
            startDate,
            endDate,
        }),
        fetchLocations(),
        fetchBookingStats(dateParams),
    ]);

    const isComparisonActive = !!stats.comparison;

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
                </div>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* KraiInsightCard — collapsed by default, at very top */}
                <KraiInsightCard
                    pageContext="booking"
                    title="Insight Booking"
                    subtitle="Analisis tren booking dan pola pemesanan"
                    defaultCollapsed={true}
                />

                {/* Stats Cards — MetricCardHorizontal */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <MetricCardHorizontal
                        icon={<Calendar className="w-5 h-5" />}
                        title="Booking"
                        value={stats.bookingCount}
                        subtitle={stats.rangeLabel}
                        comparisonValue={stats.comparison?.prevBookingCount}
                        deltaAmount={
                            stats.comparison
                                ? String(stats.bookingCount - (stats.comparison?.prevBookingCount || 0))
                                : undefined
                        }
                        deltaPercentage={
                            stats.comparison && stats.comparison.prevBookingCount > 0
                                ? ((stats.bookingCount - stats.comparison.prevBookingCount) / stats.comparison.prevBookingCount) * 100
                                : undefined
                        }
                        trend={
                            stats.comparison && stats.bookingCount >= (stats.comparison?.prevBookingCount || 0)
                                ? 'up' : 'down'
                        }
                        comparisonLabel={stats.comparison?.prevLabel}
                        isComparisonActive={isComparisonActive}
                        semanticType="booking"
                    />
                    <MetricCardHorizontal
                        icon={<DollarSign className="w-5 h-5" />}
                        title="Pendapatan"
                        value={formatCurrency(stats.totalRevenue)}
                        comparisonValue={stats.comparison ? formatCurrency(stats.comparison.prevRevenue) : undefined}
                        deltaAmount={
                            stats.comparison
                                ? formatCurrency(stats.totalRevenue - stats.comparison.prevRevenue)
                                : undefined
                        }
                        deltaPercentage={
                            stats.comparison && stats.comparison.prevRevenue > 0
                                ? ((stats.totalRevenue - stats.comparison.prevRevenue) / stats.comparison.prevRevenue) * 100
                                : undefined
                        }
                        trend={
                            stats.comparison && stats.totalRevenue >= (stats.comparison?.prevRevenue || 0)
                                ? 'up' : 'down'
                        }
                        comparisonLabel={stats.comparison?.prevLabel}
                        isComparisonActive={isComparisonActive}
                        semanticType="revenue"
                    />
                    <MetricCardHorizontal
                        icon={<CalendarDays className="w-5 h-5" />}
                        title="Transaksi"
                        value={stats.totalTransactions}
                        subtitle={stats.rangeLabel}
                        isComparisonActive={false}
                        semanticType="neutral"
                    />
                    <MetricCardHorizontal
                        icon={<TrendingUp className="w-5 h-5" />}
                        title="Rata-rata / Hari"
                        value={formatCurrency(stats.avgPerDay)}
                        isComparisonActive={false}
                        semanticType="neutral"
                    />
                </div>

                {/* Export + Filter */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <FilterBarWrapper
                        basePath="/booking"
                        rangePreset={rangePreset || 'last30days'}
                        startDate={startDate}
                        endDate={endDate}
                        comparisonMode={comparisonMode || 'none'}
                        comparisonStartDate={comparisonStartDate}
                        comparisonEndDate={comparisonEndDate}
                        extraPreservedParams={['search', 'location', 'page', 'pageSize']}
                    />
                    <ExportButton page="booking" label="Export Booking" />
                </div>

                {/* Filters — search + location only (no date filter) */}
                <BookingFilters
                    locations={locations}
                    currentSearch={search}
                    currentLocation={location}
                    currentDateFrom=""
                    currentDateTo=""
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
