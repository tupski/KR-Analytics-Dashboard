import HeaderDashboard from '@/components/dashboard/HeaderDashboard';
import AutoRefreshWrapper from '@/components/dashboard/AutoRefreshWrapper';
import TabContent from '@/components/dashboard/TabContent';
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
    fetchRevenueDataForExport,
    fetchOccupancyDataForExport,
} from './actions';
import { generateInsights } from '@/lib/dashboard/insights';
import { exportToXLSX, getExportFilename, currencyCol, dateCol, type ExportSheet } from '@/lib/export/xlsx';
import type { KPICompareMode } from '@/types/dashboard';

const VALID_COMPARE: KPICompareMode[] = ['yesterday', 'lastweek', 'lastmonth', 'lastyear'];

/**
 * DashboardPage - Main Dashboard Server Component
 *
 * Fetches all data in parallel, then delegates rendering to TabContent
 * which manages the operational/analitik tab system with bento-grid layout.
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
        unitPerformanceData,
        marketingPerformanceData,
    ] = await Promise.all([
        fetchKPIData(compareMode || undefined),
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
                    {/* Export Button */}
                    <div className="flex justify-end mb-4">
                        <ExportButton
                            onExport={async () => {
                                'use server';
                                const [revData, occData] = await Promise.all([
                                    fetchRevenueDataForExport(),
                                    fetchOccupancyDataForExport(),
                                ]);

                                const sheets: ExportSheet[] = [
                                    {
                                        name: 'Pendapatan',
                                        columns: [
                                            { header: 'Tanggal', key: 'date' },
                                            currencyCol('Pendapatan Kotor', 'grossRevenue'),
                                            currencyCol('Biaya Platform', 'platformFee'),
                                            currencyCol('Pendapatan Bersih', 'netRevenue'),
                                            { header: 'Jumlah Transaksi', key: 'transactionCount' },
                                        ],
                                        data: revData || [],
                                    },
                                    {
                                        name: 'Okupansi',
                                        columns: [
                                            { header: 'Tanggal', key: 'date' },
                                            { header: 'Total Unit', key: 'totalUnits' },
                                            { header: 'Unit Terisi', key: 'occupiedUnits' },
                                            { header: 'Unit Tersedia', key: 'availableUnits' },
                                            { header: 'Okupansi (%)', key: 'occupancyRate', format: (v: number) => `${v.toFixed(1)}%` },
                                        ],
                                        data: occData || [],
                                    },
                                ];

                                const filename = getExportFilename('dashboard');
                                return { sheets, filename };
                            }}
                            label="Export Dashboard"
                        />
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
