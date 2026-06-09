'use client';

import { useState, useMemo } from 'react';
import ClickableKpiCard from './ClickableKpiCard';
import KpiDetailModal from './KpiDetailModal';
import GrafikPendapatan from './GrafikPendapatan';
import GrafikOkupansi from './GrafikOkupansi';
import CheckinHariIni from './CheckinHariIni';
import CheckoutHariIni from './CheckoutHariIni';
import StatusUnit from './StatusUnit';
import CollapsibleChartTable from '@/components/shared/CollapsibleChartTable';
import AdvancedAnalyticsSection from './AdvancedAnalyticsSection';
import type { KPIData, KPICompareMode, LocationHealthItem, MarketingPerformanceItem, DashboardInsight } from '@/types/dashboard';
import type { UnitPerformanceData } from '@/lib/dashboard/unit-performance';
import type {
    GuestSourceSummary,
    OccupancyPerUnit,
    StayDurationSummary,
    RepeatGuest,
} from '@/lib/analytics/types';
import { DollarSign, Calendar, TrendingUp, Home, Clock, MapPin } from 'lucide-react';
import { formatCurrencyCompactIDR } from '@/lib/utils/format';
import type { KpiModalVariant, RevenueDetailData, BookingDetailData, OccupancyDetailData, AvailableDetailData } from './KpiDetailModal';

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

// ─── Busy-hour helper — pad all 24 buckets, show zero-count hours ──

interface BusyHour {
    hour: number;
    label: string;
    count: number;
}

function computeBusyHours(items: any[]): BusyHour[] {
    // Init all 24 hours with count 0
    const buckets: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
        buckets[i] = 0;
    }

    for (const item of items) {
        // Try formatted time string first, then checkinAt Date
        const timeStr = item.time || '';
        let hour = parseInt(timeStr.split(':')[0], 10);
        if (isNaN(hour) && item.checkinAt) {
            const d = item.checkinAt instanceof Date ? item.checkinAt : new Date(item.checkinAt);
            hour = d.getHours();
        }
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            buckets[hour] = (buckets[hour] || 0) + 1;
        }
    }

    return Object.entries(buckets)
        .map(([hour, count]) => ({
            hour: Number(hour),
            label: `${String(hour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:59`,
            count,
        }))
        .sort((a, b) => a.hour - b.hour);
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
    guestSourceSummary?: GuestSourceSummary[];
    occupancyPerUnit?: OccupancyPerUnit[];
    stayDurationSummary?: StayDurationSummary[];
    repeatGuests?: RepeatGuest[];
    analyticsPeriodLabel?: string;
    analyticsStartDate?: string;
    analyticsEndDate?: string;
}

/**
 * TabContent — Client component that renders the full dashboard
 * in a single scroll. Operational KPIs/charts at top, analytics
 * section below, then legacy panels at the bottom.
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
    guestSourceSummary,
    occupancyPerUnit,
    stayDurationSummary,
    repeatGuests,
    analyticsPeriodLabel,
    analyticsStartDate,
    analyticsEndDate,
}: TabContentProps) {
    // ── Modal state ────────────────────────────────────────────
    const [modalVariant, setModalVariant] = useState<KpiModalVariant | null>(null);

    // ── Computed data ──────────────────────────────────────────
    const busyHours = useMemo(() => computeBusyHours(checkinsData), [checkinsData]);

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

    // ── Modal data builders ────────────────────────────────────
    const revenueModalData: RevenueDetailData = {
        totalRevenue: kpiData.revenueToday,
        cashAmount: kpiData.cashAmount ?? 0,
        transferAmount: kpiData.transferAmount ?? 0,
        transactionCount: kpiData.transactionCount ?? 0,
    };

    const bookingModalData: BookingDetailData = {
        bookingCount: kpiData.bookingToday,
        checkinToday: checkinsData.length,
        checkoutToday: checkoutsData.length,
    };

    const occupancyModalData: OccupancyDetailData = {
        occupancyRate: kpiData.avgOccupancy,
        totalUnits: kpiData.totalUnits ?? kpiData.availableUnits + (kpiData.occupiedUnits ?? 0),
        occupiedUnits: kpiData.occupiedUnits ?? (kpiData.totalUnits ?? 0) - kpiData.availableUnits,
        locationBreakdown: kpiData.locationBreakdown ?? [],
    };

    const availableModalData: AvailableDetailData = {
        availableUnits: kpiData.availableUnits,
        occupiedUnits: kpiData.occupiedUnits ?? (kpiData.totalUnits ?? 0) - kpiData.availableUnits,
        totalUnits: kpiData.totalUnits ?? 0,
    };

    return (
        <div className="space-y-6">
            {/* KPI Cards — clickable, mobile-first 2-col, desktop 4-col */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <ClickableKpiCard
                    icon={<Calendar className="w-5 h-5" />}
                    title={getCardTitle('Booking', filterRangePreset)}
                    value={kpiData.bookingToday}
                    subtitle="Check-in tercatat hari ini"
                    semanticType="booking"
                    onClick={() => setModalVariant('booking')}
                />
                <ClickableKpiCard
                    icon={<DollarSign className="w-5 h-5" />}
                    title={getCardTitle('Pendapatan', filterRangePreset)}
                    value={formatCurrencyCompactIDR(kpiData.revenueToday)}
                    subtitle={kpiData.transactionCount != null ? `${kpiData.transactionCount} transaksi` : undefined}
                    semanticType="revenue"
                    onClick={() => setModalVariant('revenue')}
                />
                <ClickableKpiCard
                    icon={<TrendingUp className="w-5 h-5" />}
                    title={getCardTitle('Okupansi', filterRangePreset)}
                    value={`${kpiData.avgOccupancy.toFixed(1)}%`}
                    subtitle={kpiData.totalUnits != null ? `${kpiData.occupiedUnits ?? '-'} dari ${kpiData.totalUnits} unit terisi` : undefined}
                    semanticType="occupancy"
                    onClick={() => setModalVariant('occupancy')}
                />
                <ClickableKpiCard
                    icon={<Home className="w-5 h-5" />}
                    title={getCardTitle('Unit Tersedia', filterRangePreset)}
                    value={kpiData.availableUnits}
                    subtitle={kpiData.totalUnits != null ? `${kpiData.occupiedUnits ?? '-'} ditempati dari ${kpiData.totalUnits} unit` : undefined}
                    semanticType="neutral"
                    onClick={() => setModalVariant('available')}
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
                            {/* Simple bar chart — scrollable for 24 hours */}
                            <div className="space-y-1 mb-4 max-h-80 overflow-y-auto">
                                {busyHours.map((bh) => {
                                    const maxCount = Math.max(...busyHours.map((b) => b.count));
                                    const barWidth = maxCount > 0 ? (bh.count / maxCount) * 100 : 0;
                                    return (
                                        <div key={bh.hour} className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 w-24 shrink-0">{bh.label}</span>
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
                                    { key: 'label', label: 'Jam', format: 'text' },
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

            {/* ══════════════════════════════════════════════════ */}
            {/* ADVANCED ANALYTICS — collapsible on mobile        */}
            {/* ══════════════════════════════════════════════════ */}
            <AdvancedAnalyticsSection
                guestSourceSummary={guestSourceSummary || []}
                occupancyPerUnit={occupancyPerUnit || []}
                stayDurationSummary={stayDurationSummary || []}
                repeatGuests={repeatGuests || []}
                locationHealthData={locationHealthData}
                unitPerformanceData={unitPerformanceData}
                marketingPerformanceData={marketingPerformanceData}
                periodLabel={analyticsPeriodLabel || '30 Hari Terakhir'}
            />

            {/* ══════════════════════════════════════════════════ */}
            {/* KPI DETAIL MODALS — clickable card drill-down      */}
            {/* ══════════════════════════════════════════════════ */}
            <KpiDetailModal
                variant="booking"
                title={getCardTitle('Booking', filterRangePreset)}
                isOpen={modalVariant === 'booking'}
                onClose={() => setModalVariant(null)}
                data={bookingModalData}
            />
            <KpiDetailModal
                variant="revenue"
                title={getCardTitle('Pendapatan', filterRangePreset)}
                isOpen={modalVariant === 'revenue'}
                onClose={() => setModalVariant(null)}
                data={revenueModalData}
            />
            <KpiDetailModal
                variant="occupancy"
                title={getCardTitle('Okupansi', filterRangePreset)}
                isOpen={modalVariant === 'occupancy'}
                onClose={() => setModalVariant(null)}
                data={occupancyModalData}
            />
            <KpiDetailModal
                variant="available"
                title={getCardTitle('Unit Tersedia', filterRangePreset)}
                isOpen={modalVariant === 'available'}
                onClose={() => setModalVariant(null)}
                data={availableModalData}
            />
        </div>
    );
}
