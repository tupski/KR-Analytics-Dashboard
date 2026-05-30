import HeaderDashboard from '@/components/dashboard/HeaderDashboard';
import KartuRingkasan from '@/components/dashboard/KartuRingkasan';
import GrafikPendapatan from '@/components/dashboard/GrafikPendapatan';
import GrafikOkupansi from '@/components/dashboard/GrafikOkupansi';
import CheckinHariIni from '@/components/dashboard/CheckinHariIni';
import CheckoutHariIni from '@/components/dashboard/CheckoutHariIni';
import StatusUnit from '@/components/dashboard/StatusUnit';
import AutoRefreshWrapper from '@/components/dashboard/AutoRefreshWrapper';
import CompareSwitcher from '@/components/dashboard/CompareSwitcher';
import DashboardInsightSummary from '@/components/dashboard/DashboardInsightSummary';
import LocationHealthMatrix from '@/components/dashboard/LocationHealthMatrix';
import AIInsightCard from '@/components/ai/AIInsightCard';
import {
    fetchKPIData,
    fetchRevenueData,
    fetchOccupancyData,
    fetchTodayCheckins,
    fetchTodayCheckouts,
    fetchUnitStatus,
    fetchLocationHealthData,
} from './actions';
import { generateInsights } from '@/lib/dashboard/insights';
import type { KPICompareMode } from '@/types/dashboard';
import { Calendar, DollarSign, TrendingUp, Home } from 'lucide-react';

const VALID_COMPARE: KPICompareMode[] = ['yesterday', 'lastweek', 'lastmonth', 'lastyear'];

/**
 * DashboardPage - Main Dashboard Server Component
 *
 * Orchestrates data fetching and component rendering for the analytics dashboard.
 */
export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const rawCompare = typeof params.compare === 'string' ? params.compare : '';
    const compareMode = (VALID_COMPARE.includes(rawCompare as KPICompareMode)
        ? rawCompare
        : null) as KPICompareMode | null;

    // Fetch all dashboard data in parallel
    const [
        kpiData,
        revenueData,
        occupancyData,
        checkinsData,
        checkoutsData,
        unitStatusData,
        locationHealthData,
    ] = await Promise.all([
        fetchKPIData(compareMode || undefined),
        fetchRevenueData('daily'),
        fetchOccupancyData(30),
        fetchTodayCheckins(),
        fetchTodayCheckouts(),
        fetchUnitStatus(),
        fetchLocationHealthData(),
    ]);

    // Generate deterministic insights from fetched data
    const insights = generateInsights({
        kpiData,
        checkinCount: checkinsData.length,
        checkoutCount: checkoutsData.length,
    });

    const formatRupiah = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format;

    const change = kpiData.change;
    const trendFor = (pct: number | null | undefined) =>
        pct == null ? undefined : { value: Math.abs(pct), isPositive: pct >= 0 };

    return (
        <AutoRefreshWrapper>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
                {/* Header */}
                <HeaderDashboard />

                {/* Main Content */}
                <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                    {/* Top toolbar with compare switcher */}
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-white rounded-lg border border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
                        <div className="flex items-center gap-2 text-xs text-gray-600 min-w-0 flex-1">
                            {kpiData.prev ? (
                                <>
                                    <span className="font-semibold text-blue-700 flex-shrink-0">Bandingkan:</span>
                                    <span className="truncate">Hari Ini vs {kpiData.prev.label}</span>
                                </>
                            ) : (
                                <span className="truncate">Pilih mode bandingkan untuk melihat perubahan.</span>
                            )}
                        </div>
                        <CompareSwitcher current={compareMode} />
                    </div>

                    {/* AI Insight - Top */}
                    <AIInsightCard
                        title="Ringkasan Harian"
                        prompt="Berikan ringkasan performa bisnis hari ini dalam 3-4 kalimat. Sebutkan: jumlah booking, pendapatan, okupansi, dan satu rekomendasi singkat."
                    />

                    {/* KPI Cards Section */}
                    <section>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                            <KartuRingkasan
                                title="Booking Hari Ini"
                                value={kpiData.bookingToday}
                                icon={<Calendar className="w-6 h-6" />}
                                href="/booking"
                                trend={trendFor(change?.bookingChangePct)}
                            />
                            <KartuRingkasan
                                title="Pendapatan Hari Ini"
                                value={formatRupiah(kpiData.revenueToday)}
                                icon={<DollarSign className="w-6 h-6" />}
                                href="/booking"
                                trend={trendFor(change?.revenueChangePct)}
                            />
                            <KartuRingkasan
                                title="Okupansi Rata-rata"
                                value={`${kpiData.avgOccupancy.toFixed(2)}%`}
                                icon={<TrendingUp className="w-6 h-6" />}
                                href="/unit"
                                trend={trendFor(change?.occupancyChangePct)}
                            />
                            <KartuRingkasan
                                title="Unit Tersedia"
                                value={kpiData.availableUnits}
                                icon={<Home className="w-6 h-6" />}
                                href="/unit"
                                trend={trendFor(change?.availableChangePct)}
                            />
                        </div>

                        {kpiData.prev && (
                            <p className="mt-2 text-[11px] text-gray-500">
                                Pembanding: {kpiData.prev.label} — Booking: {kpiData.prev.booking} ·{' '}
                                Pendapatan: {formatRupiah(kpiData.prev.revenue)} ·{' '}
                                Okupansi: {kpiData.prev.avgOccupancy.toFixed(2)}% ·{' '}
                                Unit Tersedia: {kpiData.prev.availableUnits}
                            </p>
                        )}
                    </section>

                    {/* Insight Summary Section */}
                    <DashboardInsightSummary insights={insights} />

                    {/* Location Health Matrix Section */}
                    <LocationHealthMatrix
                        locations={locationHealthData}
                        isLoading={false}
                    />

                    {/* Charts Section */}
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
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
                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                        <CheckinHariIni items={checkinsData} />
                        <CheckoutHariIni items={checkoutsData} />
                        <StatusUnit statusCounts={unitStatusData} />
                    </section>
                </main>
            </div>
        </AutoRefreshWrapper>
    );
}
