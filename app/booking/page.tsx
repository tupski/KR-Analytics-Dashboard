import { fetchBookings, fetchLocations, fetchBookingStats } from './actions';
import BookingTable from '@/components/booking/BookingTable';
import BookingStatsCards from '@/components/booking/BookingStatsCards';
import BookingFilters from '@/components/booking/BookingFilters';
import AIInsightCard from '@/components/ai/AIInsightCard';

/**
 * Booking Page - Server Component
 * 
 * Displays a paginated list of all bookings/transactions with:
 * - Summary stats cards (today, week, month, revenue)
 * - Filter by search, location, date range
 * - Sortable table with booking details
 * - Pagination
 * 
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

    const [bookingResult, locations, stats] = await Promise.all([
        fetchBookings({ search, location, dateFrom, dateTo, page, pageSize: 20 }),
        fetchLocations(),
        fetchBookingStats(),
    ]);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Booking</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Daftar semua transaksi booking Kakarama Room
                </p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* Stats Cards */}
                <BookingStatsCards stats={stats} />

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

                {/* AI Insight */}
                <AIInsightCard
                    title="Insight Booking"
                    prompt="Analisis tren booking: bandingkan jumlah booking hari ini vs rata-rata harian bulan ini. Sebutkan lokasi paling aktif dan jam check-in tersibuk. Maksimal 3 kalimat, format teks biasa."
                />
            </main>
        </div>
    );
}
