import { format, subDays, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// ============================================================
// lib/services/date-range.ts
// Centralized date-range helpers extracted from 4 action files:
//   - dashboard/actions.ts  → getHotelDayRange()
//   - laporan/actions.ts    → getDateRange() + getPreviousDateRange()
//   - unit/actions.ts       → getUnitDateRange(filter)
//   - booking/actions.ts    → inline date logic
// ============================================================

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
// Extracted from dashboard/actions.ts:22-31
//
// TODO: The UI footer text says "12:00 WIB" hotel day boundary,
// but this function uses 00:00–23:59 WIB. Before changing to a
// 12:00 boundary:
// 1. Verify with business stakeholders which boundary is correct
// 2. Update all consumers consistently
// 3. Update UI footer text to match
//
// Current behavior: 00:00 WIB today → 23:59:59 WIB today
// ============================================================
export function getHotelDayRange(): DateRangeResult {
    const timezone = 'Asia/Jakarta';
    const now = toZonedTime(new Date(), timezone);
    const todayStr = format(now, 'yyyy-MM-dd');
    return {
        start: `${todayStr}T00:00:00`,
        end: `${todayStr}T23:59:59`,
        label: 'Hari Ini',
        dateStr: todayStr,
    };
}

// ============================================================
// getDateRange(filter)
//
// Extracted from laporan/actions.ts:9-46 and unit/actions.ts:40-85
// (same logic in both files).
//
// Uses Asia/Jakarta timezone. All ranges based on calendar days
// 00:00-23:59 WIB.
// ============================================================
export function getDateRange(filter: DateFilter): DateRangeResult {
    const timezone = 'Asia/Jakarta';
    const now = toZonedTime(new Date(), timezone);
    const todayStr = format(now, 'yyyy-MM-dd');

    switch (filter) {
        case 'today': {
            const start = `${todayStr}T00:00:00`;
            const end = `${todayStr}T23:59:59`;
            return { start, end, label: 'Hari Ini' };
        }
        case 'yesterday': {
            const yesterday = subDays(now, 1);
            const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
            const start = `${yesterdayStr}T00:00:00`;
            const end = `${yesterdayStr}T23:59:59`;
            return { start, end, label: 'Kemarin' };
        }
        case '7days': {
            const weekAgo = subDays(now, 6);
            const start = `${format(weekAgo, 'yyyy-MM-dd')}T00:00:00`;
            const end = `${todayStr}T23:59:59`;
            return { start, end, label: '7 Hari Terakhir' };
        }
        case 'month': {
            const monthStart = format(now, 'yyyy-MM-01');
            const start = `${monthStart}T00:00:00`;
            const end = `${todayStr}T23:59:59`;
            return { start, end, label: 'Bulan Ini' };
        }
        case 'year': {
            const yearStart = format(now, 'yyyy-01-01');
            const start = `${yearStart}T00:00:00`;
            const end = `${todayStr}T23:59:59`;
            return { start, end, label: 'Tahun Ini' };
        }
    }
}

// ============================================================
// getPreviousDateRange(filter)
//
// Extracted from laporan/actions.ts:48-101
//
// For 'today'     → returns yesterday
// For '7days'     → returns the previous 7 days (8-14 days ago)
// For 'month'     → returns previous month (1st to last day)
// For 'year'      → returns previous year (Jan 1 to Dec 31)
// ============================================================
export function getPreviousDateRange(filter: DateFilter): DateRangeResult {
    const timezone = 'Asia/Jakarta';
    const now = toZonedTime(new Date(), timezone);

    switch (filter) {
        case 'today': {
            // Compare to yesterday
            const r = getDateRange('yesterday');
            return { ...r, label: 'Kemarin' };
        }
        case 'yesterday': {
            // Compare to day before yesterday
            const dayBefore = subDays(now, 2);
            const dayBeforeStr = format(dayBefore, 'yyyy-MM-dd');
            return {
                start: `${dayBeforeStr}T00:00:00`,
                end: `${dayBeforeStr}T23:59:59`,
                label: 'H-2',
            };
        }
        case '7days': {
            // Previous 7 days (8-14 days ago)
            const start14 = subDays(now, 13);
            const end7 = subDays(now, 7);
            return {
                start: `${format(start14, 'yyyy-MM-dd')}T00:00:00`,
                end: `${format(end7, 'yyyy-MM-dd')}T23:59:59`,
                label: '7 Hari Sebelumnya',
            };
        }
        case 'month': {
            // Previous month: from 1st last month to last day last month
            const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDayLastMonth = subDays(firstThisMonth, 1);
            const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return {
                start: `${format(firstLastMonth, 'yyyy-MM-dd')}T00:00:00`,
                end: `${format(lastDayLastMonth, 'yyyy-MM-dd')}T23:59:59`,
                label: 'Bulan Lalu',
            };
        }
        case 'year': {
            // Previous year
            const firstThisYear = new Date(now.getFullYear(), 0, 1);
            const lastDayLastYear = subDays(firstThisYear, 1);
            const firstLastYear = new Date(now.getFullYear() - 1, 0, 1);
            return {
                start: `${format(firstLastYear, 'yyyy-MM-dd')}T00:00:00`,
                end: `${format(lastDayLastYear, 'yyyy-MM-dd')}T23:59:59`,
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
