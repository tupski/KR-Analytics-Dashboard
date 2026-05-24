import { Suspense } from 'react';
import HeaderDashboard from '@/components/dashboard/HeaderDashboard';
import KartuRingkasan from '@/components/dashboard/KartuRingkasan';
import GrafikPendapatan from '@/components/dashboard/GrafikPendapatan';
import GrafikOkupansi from '@/components/dashboard/GrafikOkupansi';
import CheckinHariIni from '@/components/dashboard/CheckinHariIni';
import CheckoutHariIni from '@/components/dashboard/CheckoutHariIni';
import StatusUnit from '@/components/dashboard/StatusUnit';
import AutoRefreshWrapper from '@/components/dashboard/AutoRefreshWrapper';
import AIInsightCard from '@/components/ai/AIInsightCard';
import {
    fetchKPIData,
    fetchRevenueData,
    fetchOccupancyData,
    fetchTodayCheckins,
    fetchTodayCheckouts,
    fetchUnitStatus,
} from './actions';
import { Calendar, DollarSign, TrendingUp, Home } from 'lucide-react';

/**
 * DashboardPage - Main Dashboard Server Component
 * 
 * Orchestrates data fetching and component rendering for the analytics dashboard.
 * Fetches all dashboard data in parallel using Promise.all for optimal performance.
 * 
 * Features:
 * - Server-side data fetching
 * - Parallel data loading
 * - KPI cards section
 * - Interactive charts
 * - Operational metrics
 * - Auto-refresh functionality
 * - Responsive grid layout
 * 
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 7.1, 7.7, 9.4, 9.5, 15.1
 */
export default async function DashboardPage() {
    // Fetch all dashboard data in parallel
    const [
        kpiData,
        revenueData,
        occupancyData,
        checkinsData,
        checkoutsData,
        unitStatusData,
    ] = await Promise.all([
        fetchKPIData(),
        fetchRevenueData('daily'),
        fetchOccupancyData(30),
        fetchTodayCheckins(),
        fetchTodayCheckouts(),
        fetchUnitStatus(),
    ]);

    return (
        <AutoRefreshWrapper>
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <HeaderDashboard />

                {/* Main Content */}
                <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                    {/* KPI Cards Section */}
                    <section>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                            <KartuRingkasan
                                title="Booking Hari Ini"
                                value={kpiData.bookingToday}
                                icon={<Calendar className="w-6 h-6" />}
                                href="/booking"
                            />
                            <KartuRingkasan
                                title="Pendapatan Hari Ini"
                                value={new Intl.NumberFormat('id-ID', {
                                    style: 'currency',
                                    currency: 'IDR',
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                }).format(kpiData.revenueToday)}
                                icon={<DollarSign className="w-6 h-6" />}
                                href="/booking"
                            />
                            <KartuRingkasan
                                title="Okupansi Rata-rata"
                                value={`${kpiData.avgOccupancy.toFixed(2)}%`}
                                icon={<TrendingUp className="w-6 h-6" />}
                                href="/unit"
                            />
                            <KartuRingkasan
                                title="Unit Tersedia"
                                value={kpiData.availableUnits}
                                icon={<Home className="w-6 h-6" />}
                                href="/unit"
                            />
                        </div>
                    </section>

                    {/* Charts Section */}
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                        <GrafikPendapatan
                            initialData={revenueData}
                            initialFilter="daily"
                        />
                        <GrafikOkupansi
                            data={occupancyData}
                            period={30}
                        />
                    </section>

                    {/* Operational Section */}
                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                        <CheckinHariIni items={checkinsData} />
                        <CheckoutHariIni items={checkoutsData} />
                        <StatusUnit statusCounts={unitStatusData} />
                    </section>

                    {/* AI Insight Section */}
                    <section>
                        <AIInsightCard
                            title="Ringkasan Harian"
                            prompt="Berikan ringkasan performa bisnis hari ini dalam 3-4 kalimat. Sebutkan: jumlah booking, pendapatan, okupansi, dan satu rekomendasi singkat. Gunakan format teks biasa tanpa markdown."
                        />
                    </section>
                </main>
            </div>
        </AutoRefreshWrapper>
    );
}


