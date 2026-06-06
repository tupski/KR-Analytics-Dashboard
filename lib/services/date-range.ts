import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears, parse, isSameDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getReportPeriodRange, DEFAULT_REPORT_PERIOD } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';
import { id as localeId } from 'date-fns/locale';

// ============================================================
// lib/services/date-range.ts
// Centralized date-range helpers extracted from 4 action files:
//   - dashboard/actions.ts  → getHotelDayRange()
//   - laporan/actions.ts    → getDateRange() + getPreviousDateRange()
//   - unit/actions.ts       → getUnitDateRange(filter)
//   - booking/actions.ts    → inline date logic
//
// Updated Phase 2B-7: added mode param to getDateRange/getPreviousDateRange,
// delegates to getReportPeriodRange() from lib/reporting-period.
// ============================================================

const TIMEZONE = 'Asia/Jakarta';

export type DateFilter = 'today' | 'yesterday' | '7days' | 'month' | 'year';

export interface DateRangeResult {
    start: string;   // ISO datetime string like "2026-05-27T00:00:00"
    end: string;     // ISO datetime string like "2026-05-27T23:59:59" (inclusive)
    label: string;   // Human-readable label like "Hari Ini"
    dateStr?: string; // yyyy-MM-dd string (only for hotelDayRange)
    /** Exclusive end: first moment AFTER the period. Use for `.lt()` in DB queries. */
    endExclusiveISO?: string;
}

/**
 * Compute the exclusive end boundary from an inclusive end ISO string.
 * Adds 1 ms to the inclusive end, which correctly yields:
 *   calendar_day: "2026-05-30T23:59:59.999+07:00" → "2026-05-31T00:00:00.000+07:00"
 *   hotel_day:    "2026-05-31T11:59:59.999+07:00" → "2026-05-31T12:00:00.000+07:00"
 */
function toExclusiveEnd(endISO: string): string {
    const nextMs = new Date(endISO).getTime() + 1;
    const zoned = toZonedTime(nextMs, TIMEZONE);
    return format(zoned, "yyyy-MM-dd'T'HH:mm:ss.SSS") + '+07:00';
}

// ============================================================
// DateFilterParams — URL string params for unified date filtering
// ============================================================
export interface DateFilterParams {
    rangePreset?: string;
    startDate?: string;
    endDate?: string;
    comparisonMode?: string;
    comparisonStartDate?: string;
    comparisonEndDate?: string;
}

// ============================================================
// getHotelDayRange()
//
// Returns the hotel-day range for today: 12:00 WIB → 11:59 WIB next day.
// Delegates to the central getReportPeriodRange().
// ============================================================
export function getHotelDayRange(): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);
    const range = getReportPeriodRange(now, 'hotel_day');
    const todayStr = format(now, 'yyyy-MM-dd');
    return {
        start: range.start,
        end: range.end,
        label: 'Hari Ini',
        dateStr: todayStr,
        endExclusiveISO: toExclusiveEnd(range.end),
    };
}

// ============================================================
// getDateRange(filter, mode?)
//
// Returns start/end/label for a named date filter.
// mode defaults to calendar_day (00:00–23:59 WIB).
// When mode = hotel_day, boundaries shift to 12:00–11:59.
// ============================================================
export function getDateRange(filter: DateFilter, mode: ReportPeriodMode = DEFAULT_REPORT_PERIOD): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);

    switch (filter) {
        case 'today': {
            const range = getReportPeriodRange(now, mode);
            return { start: range.start, end: range.end, endExclusiveISO: toExclusiveEnd(range.end), label: 'Hari Ini' };
        }
        case 'yesterday': {
            const yesterday = subDays(now, 1);
            const range = getReportPeriodRange(yesterday, mode);
            return { start: range.start, end: range.end, endExclusiveISO: toExclusiveEnd(range.end), label: 'Kemarin' };
        }
        case '7days': {
            const weekAgo = subDays(now, 6);
            const start = getReportPeriodRange(weekAgo, mode).start;
            const end = getReportPeriodRange(now, mode).end;
            return { start, end, endExclusiveISO: toExclusiveEnd(end), label: '7 Hari Terakhir' };
        }
        case 'month': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const start = getReportPeriodRange(monthStart, mode).start;
            const end = getReportPeriodRange(now, mode).end;
            return { start, end, endExclusiveISO: toExclusiveEnd(end), label: 'Bulan Ini' };
        }
        case 'year': {
            const yearStart = new Date(now.getFullYear(), 0, 1);
            const start = getReportPeriodRange(yearStart, mode).start;
            const end = getReportPeriodRange(now, mode).end;
            return { start, end, endExclusiveISO: toExclusiveEnd(end), label: 'Tahun Ini' };
        }
    }
}

// ============================================================
// getPreviousDateRange(filter, mode?)
//
// For 'today'     → returns yesterday
// For '7days'     → returns the previous 7 days (8-14 days ago)
// For 'month'     → returns previous month (1st to last day)
// For 'year'      → returns previous year (Jan 1 to Dec 31)
//
// Respects report period mode for boundary calculation.
// ============================================================
export function getPreviousDateRange(filter: DateFilter, mode: ReportPeriodMode = DEFAULT_REPORT_PERIOD): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);

    switch (filter) {
        case 'today': {
            const r = getDateRange('yesterday', mode);
            return { ...r, label: 'Kemarin' };
        }
        case 'yesterday': {
            const dayBefore = subDays(now, 2);
            const range = getReportPeriodRange(dayBefore, mode);
            return { start: range.start, end: range.end, endExclusiveISO: toExclusiveEnd(range.end), label: 'H-2' };
        }
        case '7days': {
            const start14 = subDays(now, 13);
            const end7 = subDays(now, 7);
            const end = getReportPeriodRange(end7, mode).end;
            return {
                start: getReportPeriodRange(start14, mode).start,
                end,
                endExclusiveISO: toExclusiveEnd(end),
                label: '7 Hari Sebelumnya',
            };
        }
        case 'month': {
            const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDayLastMonth = subDays(firstThisMonth, 1);
            const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = getReportPeriodRange(lastDayLastMonth, mode).end;
            return {
                start: getReportPeriodRange(firstLastMonth, mode).start,
                end,
                endExclusiveISO: toExclusiveEnd(end),
                label: 'Bulan Lalu',
            };
        }
        case 'year': {
            const firstThisYear = new Date(now.getFullYear(), 0, 1);
            const lastDayLastYear = subDays(firstThisYear, 1);
            const firstLastYear = new Date(now.getFullYear() - 1, 0, 1);
            const end = getReportPeriodRange(lastDayLastYear, mode).end;
            return {
                start: getReportPeriodRange(firstLastYear, mode).start,
                end,
                endExclusiveISO: toExclusiveEnd(end),
                label: 'Tahun Lalu',
            };
        }
    }
}

// ============================================================
// computeDateRange()
//
// Converts URL string params to date range boundaries.
// Supports all DateRangePicker presets plus the legacy 5 filters.
// Falls back to last30days.
// ============================================================
function _withExclusiveEnd(r: DateRangeResult): DateRangeResult {
    return { ...r, endExclusiveISO: toExclusiveEnd(r.end) };
}

function computeTrailingDaysRange(days: number, mode: ReportPeriodMode): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);
    const start = subDays(now, days - 1);
    const end = getReportPeriodRange(now, mode).end;
    return {
        start: getReportPeriodRange(start, mode).start,
        end,
        endExclusiveISO: toExclusiveEnd(end),
        label: `${days} Hari Terakhir`,
    };
}

function computeThisWeekRange(mode: ReportPeriodMode): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);
    const weekStart = startOfWeek(now, { locale: localeId });
    const end = getReportPeriodRange(now, mode).end;
    return {
        start: getReportPeriodRange(weekStart, mode).start,
        end,
        endExclusiveISO: toExclusiveEnd(end),
        label: 'Minggu Ini',
    };
}

function computeLastWeekRange(mode: ReportPeriodMode): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);
    const prevWeekStart = startOfWeek(subWeeks(now, 1), { locale: localeId });
    const prevWeekEnd = endOfWeek(prevWeekStart, { locale: localeId });
    const end = getReportPeriodRange(prevWeekEnd, mode).end;
    return {
        start: getReportPeriodRange(prevWeekStart, mode).start,
        end,
        endExclusiveISO: toExclusiveEnd(end),
        label: 'Minggu Lalu',
    };
}

function computeLastMonthRange(mode: ReportPeriodMode): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);
    const monthStart = startOfMonth(subMonths(now, 1));
    const monthEnd = endOfMonth(monthStart);
    const end = getReportPeriodRange(monthEnd, mode).end;
    return {
        start: getReportPeriodRange(monthStart, mode).start,
        end,
        endExclusiveISO: toExclusiveEnd(end),
        label: 'Bulan Lalu',
    };
}

/**
 * Compute date range from URL filter params.
 * Accepts both DateRangePicker presets and legacy DateFilter values.
 */
export function computeDateRange(
    rangePreset?: string,
    startDate?: string,
    endDate?: string,
    mode: ReportPeriodMode = DEFAULT_REPORT_PERIOD,
): DateRangeResult {
    const preset = rangePreset || 'today';

    switch (preset) {
        case 'today':
        case 'yesterday':
        case '7days':
            return getDateRange(preset as any, mode);
        case 'month':
        case 'thisMonth':
            return getDateRange('month', mode);
        case 'year':
        case 'thisYear':
            return getDateRange('year', mode);
        case 'last7days':
            return getDateRange('7days', mode);
        case 'last30days':
            return computeTrailingDaysRange(30, mode);
        case 'thisWeek':
            return computeThisWeekRange(mode);
        case 'lastWeek':
            return computeLastWeekRange(mode);
        case 'lastMonth':
            return computeLastMonthRange(mode);
        case 'custom':
            if (startDate && endDate) {
                const start = parse(startDate, 'yyyy-MM-dd', new Date());
                const end = parse(endDate, 'yyyy-MM-dd', new Date());
                const inclusiveEnd = getReportPeriodRange(end, mode).end;
                return {
                    start: getReportPeriodRange(start, mode).start,
                    end: inclusiveEnd,
                    endExclusiveISO: toExclusiveEnd(inclusiveEnd),
                    label: `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`,
                };
            }
            return computeTrailingDaysRange(30, mode);
        default:
            return computeTrailingDaysRange(30, mode);
    }
}

// ============================================================
// computeComparisonRange()
//
// Computes the comparison date range based on comparison mode.
// Returns null when mode is 'none' or falsy.
// ============================================================
function _compResult(start: Date, end: Date, mode: ReportPeriodMode, label: string): DateRangeResult {
    const inclusiveEnd = getReportPeriodRange(end, mode).end;
    return {
        start: getReportPeriodRange(start, mode).start,
        end: inclusiveEnd,
        endExclusiveISO: toExclusiveEnd(inclusiveEnd),
        label,
    };
}

export function computeComparisonRange(
    comparisonMode?: string,
    currentStart?: string,
    currentEnd?: string,
    comparisonStartDate?: string,
    comparisonEndDate?: string,
    mode: ReportPeriodMode = DEFAULT_REPORT_PERIOD,
): DateRangeResult | null {
    if (!comparisonMode || comparisonMode === 'none' || !currentStart || !currentEnd) return null;

    if (comparisonMode === 'custom') {
        if (!comparisonStartDate || !comparisonEndDate) return null;
        const start = parse(comparisonStartDate, 'yyyy-MM-dd', new Date());
        const end = parse(comparisonEndDate, 'yyyy-MM-dd', new Date());
        return _compResult(start, end, mode, `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`);
    }

    const startDate = new Date(currentStart);
    const endDate = new Date(currentEnd);
    const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));

    switch (comparisonMode) {
        case 'previousPeriod': {
            const compEnd = subDays(startDate, 1);
            const compStart = subDays(compEnd, durationDays - 1);
            return _compResult(compStart, compEnd, mode, 'Periode sebelumnya');
        }
        case 'previousWeek': {
            const compEnd = subWeeks(endDate, 1);
            const compStart = subWeeks(startDate, 1);
            return _compResult(compStart, compEnd, mode, 'Minggu sebelumnya');
        }
        case 'previousMonth': {
            const compEnd = subMonths(endDate, 1);
            const compStart = subMonths(startDate, 1);
            return _compResult(compStart, compEnd, mode, 'Bulan sebelumnya');
        }
        case 'previousYear': {
            const compEnd = subYears(endDate, 1);
            const compStart = subYears(startDate, 1);
            return _compResult(compStart, compEnd, mode, 'Tahun sebelumnya');
        }
        default:
            return null;
    }
}

// ============================================================
// isMonthAligned(startDate, endDate)
//
// Phase 2B-5E-2: Month-aligned detection helper
//
// Returns true if the date range is month-aligned:
// - startDate is first day of month AND endDate is last day of same month
// - OR range spans complete calendar months
//
// Used to determine if we can use monthly summary analytics.
// ============================================================
export function isMonthAligned(startDate: Date, endDate: Date): boolean {
    const firstOfStartMonth = startOfMonth(startDate);
    const lastOfEndMonth = endOfMonth(endDate);

    // Check if startDate is the first day of its month
    const startsOnFirstDay = isSameDay(startDate, firstOfStartMonth);

    // Check if endDate is the last day of its month
    const endsOnLastDay = isSameDay(endDate, lastOfEndMonth);

    // Both conditions must be true for month-aligned range
    return startsOnFirstDay && endsOnLastDay;
}
