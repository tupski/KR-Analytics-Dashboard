'use client';

import { useState, useMemo } from 'react';
import TabSwitcher, { DashboardTab } from './TabSwitcher';
import MetricCardHorizontal from './MetricCardHorizontal';
import GrafikPendapatan from './GrafikPendapatan';
import GrafikOkupansi from './GrafikOkupansi';
import CheckinHariIni from './CheckinHariIni';
import CheckoutHariIni from './CheckoutHariIni';
import StatusUnit from './StatusUnit';
import LocationHealthMatrix from './LocationHealthMatrix';
import UnitPerformancePanel from './UnitPerformancePanel';
import MarketingPerformancePanel from './MarketingPerformancePanel';
import CollapsibleChartTable from '@/components/shared/CollapsibleChartTable';
import type { KPIData, KPICompareMode, LocationHealthItem, MarketingPerformanceItem, DashboardInsight } from '@/types/dashboard';
import type { UnitPerformanceData } from '@/lib/dashboard/unit-performance';
import { Calendar, DollarSign, TrendingUp, Home, Clock, MapPin } from 'lucide-react';
import { formatCurrencyCompactIDR } from '@/lib/utils/format';

// ─── Dynamic card titles ───────────────────────────────────────

function getCardTitle(base: string, rangePreset?: string): string {
    switch (rangePreset) {
        case 'today': return `${base} Hari Ini`;
        case 'yesterday': return `${base} Kemarin`;
        case 'last7days':
        case '7days': return `${base} 7 Hari`;
        case 'last30days': return `${base} 30 Hari`;
        case 'thisWeek': return `${base} Minggu Ini`;
        case 'lastWeek': return `${base} Minggu Lalu`;
        case 'thisMonth':
        case 'month': return `${base} Bulan Ini`;
        case 'lastMonth': return `${base} Bulan Lalu`;
        case 'thisYear':
        case 'year': return `${base} Tahun Ini`;
        case 'lastYear': return `${base} Tahun Lalu`;
        default: return `${base} Hari Ini`;
    }
}

// ─── Busy-hour helper ─────────────────────────────────────────

function computeBusyHours(checkins: any[]): { hour: string; count: number }[] {
    const buckets: Record<string, number> = {};
    checkins.forEach((item: any) => {
        const hour = item.time?.split(':')[0] || '00';
        buckets[hour] = (buckets[hour] || 0) + 1;
    });
    return Object.entries(buckets)
        .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
        .sort((a, b) => a.hour.localeCompare(b.hour));
}

// ─── Props ──────────────────────────────────────────────────────

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
    filterRangePreset?: string; // for dynamic card titles
}

/**
 * TabContent — Client component that manages tab state and renders
 * the appropriate dashboard section (Operasional or Analitik).
 *
 * Uses MetricCardHorizontal (replacing KartuRingkasan),
 * CollapsibleChartTable under charts, and no duplicate AI insights.
 */
export default function TabContent({
    kpiData,
    revenueData,
    occupancyData,
    occupancyPeriod,
    checkinsData,
    checkoutsData,
    unitStatusData,
    locationHealthData,
    unitPerformanceData,
    marketingPerformanceData,
    filterRangePreset,
}: TabContentProps) {
    const [activeTab, setActiveTab] = useState<DashboardTab>('operasional');

    const change = kpiData.change;

    // Compute busy hour distribution from checkins data
    const busyHours = useMemo(() => computeBusyHours(checkinsData), [checkinsData]);

    // Compute occupancy per location from locationHealthData
    const locOccupancy = useMemo(() =>
        locationHealthData.map(loc => ({
            location: loc.location,
            totalUnits: loc.totalUnits,
            occupiedUnits: loc.occupiedUnits,
            occupancyRate: loc.occupancyRate,
            revenue: loc.revenue,
        })),
        [locationHealthData],
    );

    const trendFor =
        (pct: number | null | undefined, def: 'flat'): 'up' | 'down' | 'flat' =>
            pct == null ? def : pct >= 0 ? 'up' : 'down';

    return (
        <>
            {/* Tab Switcher */}
            <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: OPERASIONAL                                      */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'operasional' && (
                <div className="space-y-6">
                    {/* KPI Cards — MetricCardHorizontal bento grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <MetricCardHorizontal
                            icon={<Calendar className="w-5 h-5" />}
                            title={getCardTitle('Booking', filterRangePreset)}
                            value={kpiData.bookingToday}
                            comparisonValue={kpiData.prev?.booking}
                            deltaAmount={
                                change?.bookingChangePct != null
                                    ? String(kpiData.bookingToday - (kpiData.prev?.booking || 0))
                                    : undefined
                            }
                            deltaPercentage={change?.bookingChangePct ?? undefined}
                            trend={trendFor(change?.bookingChangePct, 'flat')}
                            comparisonLabel={kpiData.prev?.label}
                            isComparisonActive={!!kpiData.prev}
                            semanticType="booking"
                        />
                        <MetricCardHorizontal
                            icon={<DollarSign className="w-5 h-5" />}
                            title={getCardTitle('Pendapatan', filterRangePreset)}
                            value={formatCurrencyCompactIDR(kpiData.revenueToday)}
                            comparisonValue={kpiData.prev?.revenue ? formatCurrencyCompactIDR(kpiData.prev.revenue) : undefined}
                            deltaAmount={
                                change?.revenueChangePct != null
                                    ? formatCurrencyCompactIDR(kpiData.revenueToday - (kpiData.prev?.revenue || 0))
                                    : undefined
                            }
                            deltaPercentage={change?.revenueChangePct ?? undefined}
                            trend={trendFor(change?.revenueChangePct, 'flat')}
                            comparisonLabel={kpiData.prev?.label}
                            isComparisonActive={!!kpiData.prev}
                            semanticType="revenue"
                        />
                        <MetricCardHorizontal
                            icon={<TrendingUp className="w-5 h-5" />}
                            title={getCardTitle('Okupansi', filterRangePreset)}
                            value={`${kpiData.avgOccupancy.toFixed(2)}%`}
                            comparisonValue={kpiData.prev?.avgOccupancy ? `${kpiData.prev.avgOccupancy.toFixed(2)}%` : undefined}
                            deltaPercentage={change?.occupancyChangePct ?? undefined}
                            trend={trendFor(change?.occupancyChangePct, 'flat')}
                            comparisonLabel={kpiData.prev?.label}
                            isComparisonActive={!!kpiData.prev}
                            semanticType="occupancy"
                        />
                        <MetricCardHorizontal
                            icon={<Home className="w-5 h-5" />}
                            title={getCardTitle('Unit Tersedia', filterRangePreset)}
                            value={kpiData.availableUnits}
                            isComparisonActive={false}
                            semanticType="neutral"
                        />
                    </div>

                    {/* Charts — Side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <GrafikPendapatan initialData={revenueData} initialFilter="daily" />
                            {revenueData && revenueData.length > 0 && (
                                <CollapsibleChartTable
                                    title="Data Pendapatan"
                                    columns={[
                                        { key: 'label', label: 'Tanggal', format: 'text' },
                                        { key: 'revenue', label: 'Pendapatan', format: 'currency' },
                                        { key: 'transactionCount', label: 'Transaksi', format: 'number' },
                                    ]}
                                    rows={revenueData}
                                    defaultCollapsed={true}
                                />
                            )}
                        </div>
                        <div className="space-y-2">
                            <GrafikOkupansi data={occupancyData} period={occupancyPeriod} />
                            {occupancyData && occupancyData.length > 0 && (
                                <CollapsibleChartTable
                                    title="Data Okupansi"
                                    columns={[
                                        { key: 'date', label: 'Tanggal', format: 'text' },
                                        { key: 'occupancyRate', label: 'Okupansi', format: 'percentage' },
                                        { key: 'occupiedUnits', label: 'Terisi', format: 'number' },
                                        { key: 'totalUnits', label: 'Total Unit', format: 'number' },
                                    ]}
                                    rows={occupancyData}
                                    defaultCollapsed={true}
                                />
                            )}
                        </div>
                    </div>

                    {/* Check-in Busy Hour + Occupancy per Location */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Busy Hour */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-blue-600" />
                                Jam Check-in Tersibuk
                            </h3>
                            {busyHours.length === 0 ? (
                                <p className="text-sm text-gray-400 py-4 text-center">
                                    Tidak ada data check-in hari ini.
                                </p>
                            ) : (
                                <>
                                    {/* Simple bar chart */}
                                    <div className="space-y-2 mb-4">
                                        {busyHours.map((bh) => {
                                            const maxCount = Math.max(...busyHours.map((b) => b.count));
                                            const barWidth = maxCount > 0 ? (bh.count / maxCount) * 100 : 0;
                                            return (
                                                <div key={bh.hour} className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-500 w-12 shrink-0">{bh.hour}</span>
                                                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                                                        <div
                                                            className="bg-blue-500 h-full rounded-full transition-all"
                                                            style={{ width: `${Math.max(barWidth, 5)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-700 w-6 text-right">{bh.count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <CollapsibleChartTable
                                        title="Distribusi Check-in per Jam"
                                        columns={[
                                            { key: 'hour', label: 'Jam', format: 'text' },
                                            { key: 'count', label: 'Check-in', format: 'number' },
                                        ]}
                                        rows={busyHours}
                                        defaultCollapsed={true}
                                    />
                                </>
                            )}
                        </div>

                        {/* Occupancy per Location */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-blue-600" />
                                Okupansi per Lokasi
                            </h3>
                            {locOccupancy.length === 0 ? (
                                <p className="text-sm text-gray-400 py-4 text-center">
                                    Tidak ada data okupansi per lokasi.
                                </p>
                            ) : (
                                <>
                                    {/* Simple bar chart */}
                                    <div className="space-y-2 mb-4">
                                        {locOccupancy.map((loc) => (
                                            <div key={loc.location} className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 w-20 truncate shrink-0" title={loc.location}>
                                                    {loc.location}
                                                </span>
                                                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${loc.occupancyRate >= 80 ? 'bg-green-500' : loc.occupancyRate >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                                        style={{ width: `${Math.max(loc.occupancyRate, 3)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-medium text-gray-700 w-12 text-right">
                                                    {loc.occupancyRate.toFixed(1)}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <CollapsibleChartTable
                                        title="Data Okupansi per Lokasi"
                                        columns={[
                                            { key: 'location', label: 'Lokasi', format: 'text' },
                                            { key: 'occupancyRate', label: 'Okupansi', format: 'percentage' },
                                            { key: 'occupiedUnits', label: 'Terisi', format: 'number' },
                                            { key: 'totalUnits', label: 'Total Unit', format: 'number' },
                                        ]}
                                        rows={locOccupancy}
                                        defaultCollapsed={true}
                                    />
                                </>
                            )}
                        </div>
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
            {/* TAB: ANALITIK                                         */}
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

                    {/* Performa Channel */}
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
                </div>
            )}
        </>
    );
}
