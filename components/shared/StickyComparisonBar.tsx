'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Calendar, GitCompareArrows, Filter } from 'lucide-react';
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
import type { FilterState } from './FilterState';

// ─── Props ───────────────────────────────────────────────────────

export interface StickyComparisonBarProps {
    rangePreset: DatePreset;
    startDate: string;
    endDate: string;
    comparisonMode: ComparisonMode;
    comparisonStartDate: string;
    comparisonEndDate: string;
    reportPeriodMode: 'calendar_day' | 'hotel_day';
    onFilterChange: (filters: FilterState) => void;
    className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

const MODE_LABELS: Record<ComparisonMode, string> = {
    none: '',
    previousPeriod: 'Periode sebelumnya',
    previousWeek: 'Minggu sebelumnya',
    previousMonth: 'Bulan sebelumnya',
    previousYear: 'Tahun sebelumnya',
    custom: 'Custom',
};

function dateToInputValue(d: Date): string {
    return d.toISOString().split('T')[0];
}

function buildActiveLabel(
    rangePreset: DatePreset,
    range: DateRangeValue,
    compMode: ComparisonMode,
    compRange: DateRangeValue | null,
): string {
    const rangeStr = formatRangeDisplay(range);
    if (compMode === 'none' || !compRange) return rangeStr;

    const compStr = MODE_LABELS[compMode];
    if (compMode === 'custom') {
        const cr = formatRangeDisplay(compRange);
        return `${rangeStr} vs ${cr}`;
    }
    return `${rangeStr} vs ${compStr}`;
}

// ─── Component ───────────────────────────────────────────────────

export default function StickyComparisonBar({
    rangePreset,
    startDate,
    endDate,
    comparisonMode,
    comparisonStartDate,
    comparisonEndDate,
    reportPeriodMode,
    onFilterChange,
    className = '',
}: StickyComparisonBarProps) {
    const [expanded, setExpanded] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);

    // Derive current date range from preset / custom dates
    const currentRange: DateRangeValue = useMemo(() => {
        if (rangePreset === 'custom' && startDate && endDate) {
            return { from: new Date(startDate), to: new Date(endDate) };
        }
        return getDateRangeFromPreset(rangePreset);
    }, [rangePreset, startDate, endDate]);

    // Derive comparison range
    const compRange = comparisonMode !== 'none'
        ? getComparisonRange(comparisonMode, currentRange,
            comparisonMode === 'custom' && comparisonStartDate && comparisonEndDate
                ? { from: new Date(comparisonStartDate), to: new Date(comparisonEndDate) }
                : undefined)
        : null;

    // Local state for editing
    const [localPreset, setLocalPreset] = useState<DatePreset>(rangePreset);
    const [localRange, setLocalRange] = useState<DateRangeValue>(currentRange);
    const [localCompMode, setLocalCompMode] = useState<ComparisonMode>(comparisonMode);
    const [localCompCustom, setLocalCompCustom] = useState<DateRangeValue | undefined>(
        comparisonMode === 'custom' && comparisonStartDate && comparisonEndDate
            ? { from: new Date(comparisonStartDate), to: new Date(comparisonEndDate) }
            : undefined,
    );

    // Sync from external props when not expanded
    useEffect(() => {
        if (!expanded) {
            setLocalPreset(rangePreset);
            setLocalRange(currentRange);
            setLocalCompMode(comparisonMode);
            setLocalCompCustom(
                comparisonMode === 'custom' && comparisonStartDate && comparisonEndDate
                    ? { from: new Date(comparisonStartDate), to: new Date(comparisonEndDate) }
                    : undefined,
            );
        }
    }, [rangePreset, comparisonMode, comparisonStartDate, comparisonEndDate, expanded, startDate, endDate, currentRange]);

    const emitChange = useCallback(
        (preset: DatePreset, range: DateRangeValue, compMode: ComparisonMode, compCustom?: DateRangeValue) => {
            onFilterChange({
                rangePreset: preset,
                startDate: dateToInputValue(range.from),
                endDate: dateToInputValue(range.to),
                comparisonMode: compMode,
                comparisonStartDate: compCustom ? dateToInputValue(compCustom.from) : '',
                comparisonEndDate: compCustom ? dateToInputValue(compCustom.to) : '',
                reportPeriodMode,
            });
        },
        [onFilterChange, reportPeriodMode],
    );

    const handleRangeChange = (range: DateRangeValue) => {
        setLocalRange(range);
    };

    const handlePresetChange = (preset: DatePreset) => {
        setLocalPreset(preset);
        const newRange = getDateRangeFromPreset(preset);
        setLocalRange(newRange);
        emitChange(preset, newRange, localCompMode, localCompCustom);
    };

    const handleCompModeChange = (mode: ComparisonMode) => {
        setLocalCompMode(mode);
        emitChange(localPreset, localRange, mode, localCompCustom);
    };

    const handleCompCustomChange = (cr: DateRangeValue) => {
        setLocalCompCustom(cr);
        emitChange(localPreset, localRange, 'custom', cr);
    };

    const activeLabel = buildActiveLabel(localPreset, localRange, localCompMode, compRange);

    return (
        <div
            ref={barRef}
            className={`
                z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200
                sm:sticky sm:top-[56px] sm:z-30
                fixed bottom-0 left-0 right-0 sm:relative
                pb-safe-or-0 sm:pb-0
                shadow-[0_-2px_8px_rgba(0,0,0,0.06)] sm:shadow-none
                ${className}
            `}
        >
            {/* ── Compact bar ── */}
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-2">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                    <Filter className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-900 truncate">
                        {activeLabel}
                    </span>
                    {expanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                </button>

                {/* Mobile: expand/collapse toggle */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="sm:hidden text-xs text-blue-600 font-medium shrink-0"
                >
                    {expanded ? 'Tutup' : 'Filter'}
                </button>
            </div>

            {/* ── Expanded filter panel ── */}
            {expanded && (
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 border-t border-gray-100 pt-2">
                    <div className="flex flex-wrap items-start gap-2">
                        <DateRangePicker
                            value={localRange}
                            onChange={handleRangeChange}
                            preset={localPreset}
                            onPresetChange={handlePresetChange}
                            showPresets={true}
                            showCalendar={true}
                            mode={reportPeriodMode}
                        />
                        <ComparisonFilter
                            mode={localCompMode}
                            onChange={handleCompModeChange}
                            currentRange={localRange}
                            customRange={localCompCustom}
                            onCustomRangeChange={handleCompCustomChange}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
