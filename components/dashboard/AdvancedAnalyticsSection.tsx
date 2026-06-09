'use client';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import AnalyticsCharts from '@/components/analytics/AnalyticsCharts';
import LocationHealthMatrix from './LocationHealthMatrix';
import UnitPerformancePanel from './UnitPerformancePanel';
import MarketingPerformancePanel from './MarketingPerformancePanel';
import type {
    GuestSourceSummary,
    OccupancyPerUnit,
    StayDurationSummary,
    RepeatGuest,
} from '@/lib/analytics/types';
import type { LocationHealthItem, MarketingPerformanceItem } from '@/types/dashboard';
import type { UnitPerformanceData } from '@/lib/dashboard/unit-performance';

interface AdvancedAnalyticsSectionProps {
    // Analytics data
    guestSourceSummary: GuestSourceSummary[];
    occupancyPerUnit: OccupancyPerUnit[];
    stayDurationSummary: StayDurationSummary[];
    repeatGuests: RepeatGuest[];
    // Legacy panels
    locationHealthData: LocationHealthItem[];
    unitPerformanceData: UnitPerformanceData | null;
    marketingPerformanceData: {
        items: MarketingPerformanceItem[];
        totalRevenue: number;
        totalTransactions: number;
        activeChannels: number;
    };
    periodLabel: string;
    isLoading?: boolean;
}

/**
 * AdvancedAnalyticsSection — wraps AnalyticsCharts (Peringkat Marketing,
 * OccupancyPerUnit, StayDuration, RepeatGuests) + legacy panels
 * (LocationHealthMatrix, UnitPerformancePanel, MarketingPerformancePanel).
 *
 * Desktop: always visible as a 2/3 + 1/3 grid.
 * Mobile: collapsed by default with "Lihat Analitik Lanjutan" toggle.
 */
export default function AdvancedAnalyticsSection({
    guestSourceSummary,
    occupancyPerUnit,
    stayDurationSummary,
    repeatGuests,
    locationHealthData,
    unitPerformanceData,
    marketingPerformanceData,
    periodLabel,
    isLoading = false,
}: AdvancedAnalyticsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 640px)');
        setIsDesktop(mq.matches);
        if (mq.matches) setIsExpanded(true);
        const handler = (e: MediaQueryListEvent) => {
            setIsDesktop(e.matches);
            if (e.matches) setIsExpanded(true);
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const content = (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Analytics charts — 2/3 width */}
            <div className="lg:col-span-2 space-y-6">
                <AnalyticsCharts
                    guestSourceSummary={guestSourceSummary}
                    occupancyPerUnit={occupancyPerUnit}
                    stayDurationSummary={stayDurationSummary}
                    repeatGuests={repeatGuests}
                    periodLabel={periodLabel}
                />
            </div>
            {/* Legacy panels — 1/3 width, stacked */}
            <div className="space-y-6">
                <LocationHealthMatrix locations={locationHealthData} isLoading={isLoading} />
                <UnitPerformancePanel data={unitPerformanceData} isLoading={isLoading} />
                <MarketingPerformancePanel
                    items={marketingPerformanceData.items}
                    totalRevenue={marketingPerformanceData.totalRevenue}
                    totalTransactions={marketingPerformanceData.totalTransactions}
                    activeChannels={marketingPerformanceData.activeChannels}
                    isLoading={isLoading}
                />
            </div>
        </div>
    );

    return (
        <section>
            {/* Toggle button — visible on all sizes */}
            <div className="mb-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    {isExpanded ? 'Sembunyikan' : 'Lihat'} Analitik Lanjutan
                    {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                </button>
            </div>

            {/* Collapsible content */}
            <div className={`${!isExpanded ? 'hidden' : ''}`}>
                {content}
            </div>
        </section>
    );
}
