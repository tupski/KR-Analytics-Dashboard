'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import StickyComparisonBar from './StickyComparisonBar';
import type { FilterState } from './FilterState';
import type { DatePreset } from './DateRangePicker';
import type { ComparisonMode } from './ComparisonFilter';

// ─── Props ───────────────────────────────────────────────────────

export interface FilterBarWrapperProps {
    rangePreset?: string;
    startDate?: string;
    endDate?: string;
    comparisonMode?: string;
    comparisonStartDate?: string;
    comparisonEndDate?: string;
    reportPeriodMode?: 'calendar_day' | 'hotel_day';
    basePath: string;
    extraPreservedParams?: string[];
    className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function dateToInputValue(d: Date): string {
    return d.toISOString().split('T')[0];
}

// ─── Component ───────────────────────────────────────────────────

/**
 * FilterBarWrapper — Client component wrapper around StickyComparisonBar.
 *
 * Reads filter state from URL params (via searchParams + props from server),
 * and on change, pushes new URL params via router.push.
 *
 * Meant to be used in server-component pages that currently use DateFilterBar.
 */
export default function FilterBarWrapper({
    rangePreset,
    startDate,
    endDate,
    comparisonMode,
    comparisonStartDate,
    comparisonEndDate,
    reportPeriodMode = 'calendar_day',
    basePath,
    extraPreservedParams = [],
    className = '',
}: FilterBarWrapperProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleFilterChange = (filters: FilterState) => {
        const params = new URLSearchParams();

        // Preserve extra params (search, page, location, etc.)
        for (const key of extraPreservedParams) {
            const val = searchParams?.get(key);
            if (val) params.set(key, val);
        }

        // Date range
        params.set('rangePreset', filters.rangePreset);
        if (filters.rangePreset === 'custom') {
            params.set('startDate', filters.startDate);
            params.set('endDate', filters.endDate);
        } else {
            params.delete('startDate');
            params.delete('endDate');
        }

        // Comparison
        if (filters.comparisonMode !== 'none') {
            params.set('comparisonMode', filters.comparisonMode);
            if (filters.comparisonMode === 'custom') {
                params.set('comparisonStartDate', filters.comparisonStartDate);
                params.set('comparisonEndDate', filters.comparisonEndDate);
            } else {
                params.delete('comparisonStartDate');
                params.delete('comparisonEndDate');
            }
        } else {
            params.delete('comparisonMode');
            params.delete('comparisonStartDate');
            params.delete('comparisonEndDate');
        }

        const qs = params.toString();
        router.push(qs ? `${basePath}?${qs}` : basePath);
    };

    return (
        <div className="relative z-50">
            <StickyComparisonBar
                rangePreset={(rangePreset || 'today') as DatePreset}
                startDate={startDate || ''}
                endDate={endDate || ''}
                comparisonMode={(comparisonMode || 'none') as ComparisonMode}
                comparisonStartDate={comparisonStartDate || ''}
                comparisonEndDate={comparisonEndDate || ''}
                reportPeriodMode={reportPeriodMode as 'calendar_day' | 'hotel_day'}
                onFilterChange={handleFilterChange}
                className={className}
            />
        </div>
    );
}
