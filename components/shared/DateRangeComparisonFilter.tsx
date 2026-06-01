'use client';

import { useState } from 'react';
import { Calendar, GitCompareArrows } from 'lucide-react';
import DateRangePicker, {
    getDateRangeFromPreset,
    type DatePreset,
    type DateRangeValue,
} from './DateRangePicker';
import ComparisonFilter, {
    type ComparisonMode,
} from './ComparisonFilter';
import ReportPeriodChip from './ReportPeriodChip';
import type { FilterState } from './FilterState';

// ─── Props ───────────────────────────────────────────────────────

export interface DateRangeComparisonFilterProps {
    value: FilterState;
    onChange: (state: FilterState) => void;
    className?: string;
    showReportPeriod?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

function dateToInputValue(d: Date): string {
    return d.toISOString().split('T')[0];
}

// ─── Component ───────────────────────────────────────────────────

export default function DateRangeComparisonFilter({
    value,
    onChange,
    className = '',
    showReportPeriod = true,
}: DateRangeComparisonFilterProps) {
    // Derive DateRangeValue from FilterState
    const currentRange: DateRangeValue = (() => {
        if (value.rangePreset === 'custom' && value.startDate && value.endDate) {
            return { from: new Date(value.startDate), to: new Date(value.endDate) };
        }
        return getDateRangeFromPreset(value.rangePreset);
    })();

    const compCustomRange: DateRangeValue | undefined =
        value.comparisonMode === 'custom' && value.comparisonStartDate && value.comparisonEndDate
            ? { from: new Date(value.comparisonStartDate), to: new Date(value.comparisonEndDate) }
            : undefined;

    // ── Handlers ──

    const handleRangeChange = (range: DateRangeValue) => {
        onChange({
            ...value,
            startDate: dateToInputValue(range.from),
            endDate: dateToInputValue(range.to),
        });
    };

    const handlePresetChange = (preset: DatePreset) => {
        const range = getDateRangeFromPreset(preset);
        onChange({
            ...value,
            rangePreset: preset,
            startDate: dateToInputValue(range.from),
            endDate: dateToInputValue(range.to),
        });
    };

    const handleCompModeChange = (mode: ComparisonMode) => {
        onChange({
            ...value,
            comparisonMode: mode,
            // Clear custom comparison dates if not custom mode
            comparisonStartDate: mode === 'custom' ? value.comparisonStartDate : '',
            comparisonEndDate: mode === 'custom' ? value.comparisonEndDate : '',
        });
    };

    const handleCompCustomRangeChange = (cr: DateRangeValue) => {
        onChange({
            ...value,
            comparisonMode: 'custom',
            comparisonStartDate: dateToInputValue(cr.from),
            comparisonEndDate: dateToInputValue(cr.to),
        });
    };

    return (
        <div className={`flex flex-wrap items-center gap-2 sm:gap-3 ${className}`}>
            <DateRangePicker
                value={currentRange}
                onChange={handleRangeChange}
                preset={value.rangePreset}
                onPresetChange={handlePresetChange}
                showPresets={true}
                showCalendar={true}
                mode={value.reportPeriodMode}
            />
            <ComparisonFilter
                mode={value.comparisonMode}
                onChange={handleCompModeChange}
                currentRange={currentRange}
                customRange={compCustomRange}
                onCustomRangeChange={handleCompCustomRangeChange}
            />
            {showReportPeriod && (
                <ReportPeriodChip />
            )}
        </div>
    );
}
