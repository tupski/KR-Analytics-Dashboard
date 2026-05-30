import { format, parse, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// ============================================================
// lib/reporting-period.ts
// Central helper for report period range calculation.
//
// Supports two modes:
//   calendar_day — 00:00–23:59 WIB (default)
//   hotel_day    — 12:00 WIB today – 11:59 WIB next day
// ============================================================

const TIMEZONE = 'Asia/Jakarta';

export type ReportPeriodMode = 'calendar_day' | 'hotel_day';

export const REPORT_PERIOD_LABELS: Record<ReportPeriodMode, string> = {
    calendar_day: 'Harian Kalender',
    hotel_day: 'Jam Hotel',
};

export const REPORT_PERIOD_DESCRIPTIONS: Record<ReportPeriodMode, string> = {
    calendar_day: '00:00 sampai 23:59',
    hotel_day: '12:00 sampai 11:59 hari berikutnya',
};

export const DEFAULT_REPORT_PERIOD: ReportPeriodMode = 'calendar_day';

/**
 * Returns start/end date range for a given date and report period mode.
 *
 * calendar_day (default):
 *   date 2026-05-30 → start: 2026-05-30T00:00:00.000+07:00
 *                     end:   2026-05-30T23:59:59.999+07:00
 *
 * hotel_day:
 *   date 2026-05-30 → start: 2026-05-30T12:00:00.000+07:00
 *                     end:   2026-05-31T11:59:59.999+07:00
 */
export function getReportPeriodRange(
    date: Date | string,
    mode: ReportPeriodMode = DEFAULT_REPORT_PERIOD,
): { start: string; end: string } {
    const dateObj = typeof date === 'string' ? parse(date, 'yyyy-MM-dd', new Date()) : date;
    const zoned = toZonedTime(dateObj, TIMEZONE);
    const dateStr = format(zoned, 'yyyy-MM-dd');

    if (mode === 'hotel_day') {
        const nextDate = addDays(zoned, 1);
        const nextDateStr = format(nextDate, 'yyyy-MM-dd');
        return {
            start: `${dateStr}T12:00:00.000+07:00`,
            end: `${nextDateStr}T11:59:59.999+07:00`,
        };
    }

    // calendar_day (default)
    return {
        start: `${dateStr}T00:00:00.000+07:00`,
        end: `${dateStr}T23:59:59.999+07:00`,
    };
}
