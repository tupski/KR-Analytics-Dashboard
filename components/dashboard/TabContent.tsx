'use client';

import { useState } from 'react';
import TabSwitcher, { DashboardTab } from './TabSwitcher';
import KartuRingkasan from './KartuRingkasan';
import GrafikPendapatan from './GrafikPendapatan';
import GrafikOkupansi from './GrafikOkupansi';
import CheckinHariIni from './CheckinHariIni';
import CheckoutHariIni from './CheckoutHariIni';
import StatusUnit from './StatusUnit';
import CompareSwitcher from './CompareSwitcher';
// import DashboardInsightSummary from './DashboardInsightSummary';
import LocationHealthMatrix from './LocationHealthMatrix';
import UnitPerformancePanel from './UnitPerformancePanel';
import MarketingPerformancePanel from './MarketingPerformancePanel';
import AIInsightCard from '@/components/ai/AIInsightCard';
import AIInsightsExpandable from '@/components/ai/AIInsightsExpandable';
import type { KPIData, KPICompareMode, LocationHealthItem, MarketingPerformanceItem, DashboardInsight } from '@/types/dashboard';
import type { UnitPerformanceData } from '@/lib/dashboard/unit-performance';
import { Calendar, DollarSign, TrendingUp, Home } from 'lucide-react';

// ─── Props (uses actual project types) ──────────────────────────
interface TabContentProps {
    kpiData: KPIData;
    compareMode: KPICompareMode | null;
    insights: DashboardInsight[];
    revenueData: any;
    occupancyData: any;
    occupancyPeriod: number;
    checkinsData: any[];
    checkoutsData: any[];
    unitStatusData: any;
    locationHealthData: LocationHealthItem[];
    unitPerformanceData: UnitPerformanceData | null;
    marketingPerformanceData: {
        items: MarketingPerformanceItem[];
        totalRevenue: number;
        totalTransactions: number;
        activeChannels: number;
    };
}

/**
 * TabContent — Client component that manages tab state and renders
 * the appropriate dashboard section (Operasional or Analitik).
 */
export default function TabContent({
    kpiData,
    compareMode,
    insights,
    revenueData,
    occupancyData,
    occupancyPeriod,
    checkinsData,
    checkoutsData,
    unitStatusData,
    locationHealthData,
    unitPerformanceData,
    marketingPerformanceData,
}: TabContentProps) {
    const [activeTab, setActiveTab] = useState<DashboardTab>('operasional');

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
        <>
            {/* Tab Switcher — placed below header */}
            <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: OPERASIONAL (Daily Ops View)                     */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'operasional' && (
                <div className="space-y-6">
                    {/* Compare Switcher toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-white rounded-xl border border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
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

                    {/* AI Insight — Top */}
                    <AIInsightCard
                        title="Ringkasan Harian"
                        prompt="Berikan ringkasan performa bisnis hari ini dalam 3-4 kalimat. Sebutkan: jumlah booking, pendapatan, okupansi, dan satu rekomendasi singkat."
                    />

                    {/* KPI Cards — Bento grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
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
                        <p className="text-[11px] text-gray-500 -mt-4">
                            Pembanding: {kpiData.prev.label} — Booking: {kpiData.prev.booking} ·{' '}
                            Pendapatan: {formatRupiah(kpiData.prev.revenue)} ·{' '}
                            Okupansi: {kpiData.prev.avgOccupancy.toFixed(2)}% ·{' '}
                            Unit Tersedia: {kpiData.prev.availableUnits}
                        </p>
                    )}

                    {/* Insight Summary */}
                    {/* <DashboardInsightSummary insights={insights} /> */}

                    {/* AI Insights — Expandable (deterministic rule-based insights) */}
                    <AIInsightsExpandable insights={insights} maxVisible={3} />

                    {/* Charts — Side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <GrafikPendapatan initialData={revenueData} initialFilter="daily" />
                        <GrafikOkupansi data={occupancyData} period={occupancyPeriod} />
                    </div>

                    {/* Operational — 3-column */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <CheckinHariIni items={checkinsData} />
                        <CheckoutHariIni items={checkoutsData} />
                        <StatusUnit statusCounts={unitStatusData} />
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: ANALITIK (Performance Analytics View)            */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'analitik' && (
                <div className="space-y-6">
                    {/* Kesehatan Lokasi */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
                        <LocationHealthMatrix locations={locationHealthData} isLoading={false} />
                    </div>

                    {/* Performa Unit */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
                        <UnitPerformancePanel data={unitPerformanceData} isLoading={false} />
                    </div>

                    {/* Performa Channel (Top 5 default) */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
                        <MarketingPerformancePanel
                            items={marketingPerformanceData.items}
                            totalRevenue={marketingPerformanceData.totalRevenue}
                            totalTransactions={marketingPerformanceData.totalTransactions}
                            activeChannels={marketingPerformanceData.activeChannels}
                            isLoading={false}
                            maxRows={5}
                        />
                    </div>

                    {/* AI Insights — Expandable (3 lines default) */}
                    <AIInsightsExpandable insights={insights} maxVisible={3} />
                </div>
            )}
        </>
    );
}
