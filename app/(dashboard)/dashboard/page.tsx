import HeaderDashboard from '@/components/dashboard/HeaderDashboard';
import AutoRefreshWrapper from '@/components/dashboard/AutoRefreshWrapper';
import TabContent from '@/components/dashboard/TabContent';
import ExportButton from '@/components/shared/ExportButton';
import DateFilterBar from '@/components/shared/DateFilterBar';
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
import { generateInsights } from '@/lib/dashboard/insights';
import type { KPICompareMode } from '@/types/dashboard';

const VALID_COMPARE: KPICompareMode[] = ['yesterday', 'lastweek', 'lastmonth', 'lastyear'];

/**
 * DashboardPage - Main Dashboard Server Component
 *
 * Fetches all data in parallel, then delegates rendering to TabContent
 * which manages the operational/analitik tab system with bento-grid layout.
 *
 * Accepts date filter params: rangePreset, startDate, endDate, comparisonMode,
 * comparisonStartDate, comparisonEndDate for unified date range + comparison.
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
    ] = await Promise.all([
        fetchKPIData(compareMode || undefined, dateParams),
        fetchRevenueData('daily'),
        fetchOccupancyData(30),
        fetchTodayCheckins(),
        fetchTodayCheckouts(),
        fetchUnitStatus(),
        fetchLocationHealthData(),
        fetchUnitPerformanceData(),
        fetchMarketingPerformanceData(),
    ]);

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
                <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                    {/* Date Filter Bar + Export */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <DateFilterBar
                            basePath="/dashboard"
                            defaultPreset={rangePreset as any || 'last30days'}
                            defaultStartDate={startDate}
                            defaultEndDate={endDate}
                            defaultComparisonMode={comparisonMode as any || 'none'}
                            defaultComparisonStartDate={comparisonStartDate}
                            defaultComparisonEndDate={comparisonEndDate}
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
                    />
                </main>
            </div>
        </AutoRefreshWrapper>
    );
}
