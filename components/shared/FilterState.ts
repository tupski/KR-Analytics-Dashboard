import type { DatePreset } from './DateRangePicker';
import type { ComparisonMode } from './ComparisonFilter';

/**
 * FilterState — unified filter state used across all page-level components.
 * Aligns with existing DateRangePicker (DatePreset) and ComparisonFilter (ComparisonMode) types.
 */
export interface FilterState {
    rangePreset: DatePreset;
    startDate: string; // ISO date string (YYYY-MM-DD)
    endDate: string;
    comparisonMode: ComparisonMode;
    comparisonStartDate: string;
    comparisonEndDate: string;
    reportPeriodMode: 'calendar_day' | 'hotel_day';
}
