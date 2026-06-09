import HeaderDashboard from '@/components/dashboard/HeaderDashboard';
import AutoRefreshWrapper from '@/components/dashboard/AutoRefreshWrapper';
import TabContent from '@/components/dashboard/TabContent';
import KraiInsightCard from '@/components/ai/KraiInsightCard';
import FilterBarWrapper from '@/components/shared/FilterBarWrapper';
import ExportButton from '@/components/shared/ExportButton';
import {
    fetchKPIData,
    fetchRevenueData,
    fetchOccupancyData,
    fetchTodayCheckins,
    fetchTodayCheckouts,
    fetchUnitStatus,
    fetchLocationHealthData,
    fetchUnitPerformanceData,
    fetchMarketingPerformanceData,
} from './actions';
import {
    getGuestSourceSummary,
    getOccupancyPerUnit,
    getStayDurationSummary,
    getRepeatGuests,
} from '@/lib/analytics/analytics-service';
import { generateInsights } from '@/lib/dashboard/insights';
import { computeDateRange } from '@/lib/services/date-range';
import type { KPICompareMode } from '@/types/dashboard';

const VALID_COMPARE: KPICompareMode[] = ['yesterday', 'lastweek', 'lastmonth', 'lastyear'];

/**
 * DashboardPage - Main Dashboard Server Component
 *
 * Uses KraiInsightCard (collapsed by default) at very top,
 * StickyComparisonBar for unified filter, MetricCardHorizontal
 * for KPI cards, and CollapsibleChartTable under charts.
 * No duplicate AI Insight — only KraiInsightCard.
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

    // Unified date filter params from URL
    const rangePreset = typeof params.rangePreset === 'string' ? params.rangePreset : undefined;
    const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
    const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
    const comparisonMode = typeof params.comparisonMode === 'string' ? params.comparisonMode : undefined;
    const comparisonStartDate = typeof params.comparisonStartDate === 'string' ? params.comparisonStartDate : undefined;
    const comparisonEndDate = typeof params.comparisonEndDate === 'string' ? params.comparisonEndDate : undefined;

    const dateParams = rangePreset ? { rangePreset, startDate, endDate, comparisonMode, comparisonStartDate, comparisonEndDate } : undefined;

    // Compute the actual date range for analytics
    const analyticsRange = computeDateRange(rangePreset, startDate, endDate);
    const analyticsStartDate = analyticsRange.start.split('T')[0];
    const analyticsEndDate = analyticsRange.end.split('T')[0];

    // Fetch all dashboard data in parallel
    const [
        kpiData,
        revenueData,
        occupancyData,
        checkinsData,
        checkoutsData,
        unitStatusData,
        locationHealthData,
        unitPerformanceData,
        marketingPerformanceData,
        guestSourceSummary,
        occupancyPerUnit,
        stayDurationSummary,
        repeatGuests,
    ] = await Promise.all([
        fetchKPIData(compareMode || undefined, dateParams),
        fetchRevenueData('daily'),
        fetchOccupancyData(30),
        fetchTodayCheckins(dateParams),
        fetchTodayCheckouts(dateParams),
        fetchUnitStatus(),
        fetchLocationHealthData(),
        fetchUnitPerformanceData(),
        fetchMarketingPerformanceData(),
        getGuestSourceSummary(analyticsStartDate, analyticsEndDate, null, 10, 0).catch(() => []),
        getOccupancyPerUnit(analyticsStartDate, analyticsEndDate, null, 10, 0).catch(() => []),
        getStayDurationSummary(analyticsStartDate, analyticsEndDate, null).catch(() => []),
        getRepeatGuests(analyticsStartDate, analyticsEndDate, null, 10, 0).catch(() => []),
    ]);

    // Compute periodLabel from URL params
    const periodLabel = rangePreset || (startDate && endDate ? `${startDate} - ${endDate}` : '30 Hari Terakhir');

    // Compute data summary for contextual AI insights
    const dashboardDataSummary = {
        revenue: kpiData.revenueToday,
        revenueChange: kpiData.change?.revenueChangePct,
        revenuePrev: kpiData.prev?.revenue,
        bookingCount: kpiData.bookingToday,
        bookingChange: kpiData.change?.bookingChangePct,
        bookingPrev: kpiData.prev?.booking,
        occupancyRate: kpiData.avgOccupancy,
        occupancyPrev: kpiData.prev?.avgOccupancy,
        availableUnits: kpiData.availableUnits,
        checkinCount: checkinsData.length,
        checkoutCount: checkoutsData.length,
        locationHealth: locationHealthData.map(l => ({
            location: l.location,
            occupancyRate: l.occupancyRate,
            revenue: l.revenue,
            totalUnits: l.totalUnits,
            occupiedUnits: l.occupiedUnits,
        })),
        topLocations: locationHealthData
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)
            .map(l => ({ name: l.location, revenue: l.revenue, occupancyRate: l.occupancyRate })),
        periodLabel: compareMode || rangePreset || 'Hari Ini',
    };

    // Generate deterministic insights from fetched data
    const insights = generateInsights({
        kpiData,
        checkinCount: checkinsData.length,
        checkoutCount: checkoutsData.length,
    });

    return (
        <AutoRefreshWrapper>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
                {/* Header */}
                <HeaderDashboard />

                {/* Main Content */}
                <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-20">
                    {/* KraiInsightCard — collapsed by default, at very top */}
                    <div className="mb-4">
                        <KraiInsightCard
                            pageContext="dashboard"
                            title="Ringkasan Dashboard"
                            subtitle="Analisis singkat performa bisnis hari ini"
                            defaultCollapsed={true}
                            dataSummary={dashboardDataSummary}
                        />
                    </div>

                    {/* StickyComparisonBar + Export */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <FilterBarWrapper
                            basePath="/dashboard"
                            rangePreset={rangePreset || 'today'}
                            startDate={startDate}
                            endDate={endDate}
                            comparisonMode={comparisonMode || 'none'}
                            comparisonStartDate={comparisonStartDate}
                            comparisonEndDate={comparisonEndDate}
                        />
                        <ExportButton page="dashboard" label="Export Dashboard" />
                    </div>

                    <TabContent
                        kpiData={kpiData}
                        compareMode={compareMode}
                        insights={insights}
                        revenueData={revenueData}
                        occupancyData={occupancyData}
                        occupancyPeriod={30}
                        checkinsData={checkinsData}
                        checkoutsData={checkoutsData}
                        unitStatusData={unitStatusData}
                        locationHealthData={locationHealthData}
                        unitPerformanceData={unitPerformanceData}
                        marketingPerformanceData={marketingPerformanceData}
                        filterRangePreset={rangePreset}
                        guestSourceSummary={guestSourceSummary}
                        occupancyPerUnit={occupancyPerUnit}
                        stayDurationSummary={stayDurationSummary}
                        repeatGuests={repeatGuests}
                        analyticsPeriodLabel={periodLabel}
                        analyticsStartDate={analyticsStartDate || ''}
                        analyticsEndDate={analyticsEndDate || ''}
                    />
                </main>
            </div>
        </AutoRefreshWrapper>
    );
}
