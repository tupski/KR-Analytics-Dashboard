'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import DateRangePicker, {
    getDateRangeFromPreset,
    formatRangeDisplay,
    type DatePreset,
    type DateRangeValue,
} from './DateRangePicker';
import ComparisonFilter, {
    getComparisonRange,
    type ComparisonMode,
} from './ComparisonFilter';

// ─── Props ───────────────────────────────────────────────────────
interface DateFilterBarProps {
    /** The base path for URL navigation */
    basePath: string;
    /** Currently selected range preset from URL */
    defaultPreset?: DatePreset;
    /** Custom start date (from URL) */
    defaultStartDate?: string;
    /** Custom end date (from URL) */
    defaultEndDate?: string;
    /** Current comparison mode from URL */
    defaultComparisonMode?: ComparisonMode;
    /** Custom comparison start date (from URL) */
    defaultComparisonStartDate?: string;
    /** Custom comparison end date (from URL) */
    defaultComparisonEndDate?: string;
    /** Optional extra search params to preserve */
    extraPreservedParams?: string[];
    /** Hide the comparison filter */
    hideComparison?: boolean;
    /** Hide the date range picker */
    hideDateRange?: boolean;
    className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
function dateToInputValue(d: Date): string {
    return d.toISOString().split('T')[0];
}

// ─── Component ───────────────────────────────────────────────────
export default function DateFilterBar({
    basePath,
    defaultPreset = 'last30days',
    defaultStartDate,
    defaultEndDate,
    defaultComparisonMode = 'none',
    defaultComparisonStartDate,
    defaultComparisonEndDate,
    extraPreservedParams = [],
    hideComparison = false,
    hideDateRange = false,
    className = '',
}: DateFilterBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // ── Determine initial range from preset or custom dates ──
    const initialRange: DateRangeValue = (() => {
        if (defaultPreset === 'custom' && defaultStartDate && defaultEndDate) {
            return {
                from: new Date(defaultStartDate),
                to: new Date(defaultEndDate),
            };
        }
        return getDateRangeFromPreset(defaultPreset);
    })();

    // ── State ──
    const [currentPreset, setCurrentPreset] = useState<DatePreset>(defaultPreset);
    const [range, setRange] = useState<DateRangeValue>(initialRange);
    const [compMode, setCompMode] = useState<ComparisonMode>(defaultComparisonMode);
    const [compCustomRange, setCompCustomRange] = useState<DateRangeValue | undefined>(
        defaultComparisonMode === 'custom' && defaultComparisonStartDate && defaultComparisonEndDate
            ? { from: new Date(defaultComparisonStartDate), to: new Date(defaultComparisonEndDate) }
            : undefined,
    );

    // ── Navigate on change ──
    const navigate = useCallback(
        (newPreset: DatePreset, newRange: DateRangeValue, newCompMode: ComparisonMode, newCompCustom?: DateRangeValue) => {
            const params = new URLSearchParams();

            // Preserve extra params
            for (const key of extraPreservedParams) {
                const val = searchParams?.get(key);
                if (val) params.set(key, val);
            }

            // Date range
            params.set('rangePreset', newPreset);
            if (newPreset === 'custom') {
                params.set('startDate', dateToInputValue(newRange.from));
                params.set('endDate', dateToInputValue(newRange.to));
            } else {
                params.delete('startDate');
                params.delete('endDate');
            }

            // Comparison
            if (newCompMode !== 'none') {
                params.set('comparisonMode', newCompMode);
                if (newCompMode === 'custom' && newCompCustom) {
                    params.set('comparisonStartDate', dateToInputValue(newCompCustom.from));
                    params.set('comparisonEndDate', dateToInputValue(newCompCustom.to));
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
        },
        [router, basePath, searchParams, extraPreservedParams],
    );

    // ── Handlers ──
    const handleRangeChange = (newRange: DateRangeValue) => {
        setRange(newRange);
        // Navigate with current comp mode
        navigate(currentPreset, newRange, compMode, compCustomRange);
    };

    const handlePresetChange = (preset: DatePreset) => {
        setCurrentPreset(preset);
        const newRange = getDateRangeFromPreset(preset);
        setRange(newRange);
        navigate(preset, newRange, compMode, compCustomRange);
    };

    const handleCompModeChange = (mode: ComparisonMode) => {
        setCompMode(mode);
        navigate(currentPreset, range, mode, compCustomRange);
    };

    const handleCompCustomRangeChange = (cr: DateRangeValue) => {
        setCompCustomRange(cr);
        navigate(currentPreset, range, compMode, cr);
    };

    return (
        <div className={`flex flex-wrap items-start gap-2 sm:gap-3 ${className}`}>
            {!hideDateRange && (
                <DateRangePicker
                    value={range}
                    onChange={handleRangeChange}
                    preset={currentPreset}
                    onPresetChange={handlePresetChange}
                    showPresets={true}
                    showCalendar={true}
                />
            )}

            {!hideComparison && (
                <ComparisonFilter
                    mode={compMode}
                    onChange={handleCompModeChange}
                    currentRange={range}
                    customRange={compCustomRange}
                    onCustomRangeChange={handleCompCustomRangeChange}
                />
            )}
        </div>
    );
}
