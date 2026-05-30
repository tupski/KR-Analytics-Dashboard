import { format, subDays, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getReportPeriodRange, DEFAULT_REPORT_PERIOD } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';

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
    end: string;     // ISO datetime string like "2026-05-27T23:59:59"
    label: string;   // Human-readable label like "Hari Ini"
    dateStr?: string; // yyyy-MM-dd string (only for hotelDayRange)
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
    };
}

// ============================================================
// getDateRange(filter, mode?)
//
// Returns start/end/label for a named date filter.
// mode defaults to calendar_day (00:00–23:59 WIB).
// When mode = hotel_day, boundaries shift to 12:00–11:59.
//
// Examples (today = 2026-05-30):
//   today  + calendar_day → 2026-05-30T00:00:00 → 2026-05-30T23:59:59
//   today  + hotel_day    → 2026-05-30T12:00:00 → 2026-05-31T11:59:59
//   7days  + calendar_day → 2026-05-24T00:00:00 → 2026-05-30T23:59:59
//   7days  + hotel_day    → 2026-05-24T12:00:00 → 2026-05-31T11:59:59
// ============================================================
export function getDateRange(filter: DateFilter, mode: ReportPeriodMode = DEFAULT_REPORT_PERIOD): DateRangeResult {
    const now = toZonedTime(new Date(), TIMEZONE);

    switch (filter) {
        case 'today': {
            const range = getReportPeriodRange(now, mode);
            return { start: range.start, end: range.end, label: 'Hari Ini' };
        }
        case 'yesterday': {
            const yesterday = subDays(now, 1);
            const range = getReportPeriodRange(yesterday, mode);
            return { start: range.start, end: range.end, label: 'Kemarin' };
        }
        case '7days': {
            const weekAgo = subDays(now, 6);
            const start = getReportPeriodRange(weekAgo, mode).start;
            const end = getReportPeriodRange(now, mode).end;
            return { start, end, label: '7 Hari Terakhir' };
        }
        case 'month': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const start = getReportPeriodRange(monthStart, mode).start;
            const end = getReportPeriodRange(now, mode).end;
            return { start, end, label: 'Bulan Ini' };
        }
        case 'year': {
            const yearStart = new Date(now.getFullYear(), 0, 1);
            const start = getReportPeriodRange(yearStart, mode).start;
            const end = getReportPeriodRange(now, mode).end;
            return { start, end, label: 'Tahun Ini' };
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
            // Compare to yesterday
            const r = getDateRange('yesterday', mode);
            return { ...r, label: 'Kemarin' };
        }
        case 'yesterday': {
            // Compare to day before yesterday
            const dayBefore = subDays(now, 2);
            const range = getReportPeriodRange(dayBefore, mode);
            return {
                start: range.start,
                end: range.end,
                label: 'H-2',
            };
        }
        case '7days': {
            // Previous 7 days (8-14 days ago)
            const start14 = subDays(now, 13);
            const end7 = subDays(now, 7);
            return {
                start: getReportPeriodRange(start14, mode).start,
                end: getReportPeriodRange(end7, mode).end,
                label: '7 Hari Sebelumnya',
            };
        }
        case 'month': {
            // Previous month: from 1st last month to last day last month
            const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDayLastMonth = subDays(firstThisMonth, 1);
            const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return {
                start: getReportPeriodRange(firstLastMonth, mode).start,
                end: getReportPeriodRange(lastDayLastMonth, mode).end,
                label: 'Bulan Lalu',
            };
        }
        case 'year': {
            // Previous year
            const firstThisYear = new Date(now.getFullYear(), 0, 1);
            const lastDayLastYear = subDays(firstThisYear, 1);
            const firstLastYear = new Date(now.getFullYear() - 1, 0, 1);
            return {
                start: getReportPeriodRange(firstLastYear, mode).start,
                end: getReportPeriodRange(lastDayLastYear, mode).end,
                label: 'Tahun Lalu',
            };
        }
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
