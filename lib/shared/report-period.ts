import { toZonedTime, formatInTimeZone, getTimezoneOffset } from 'date-fns-tz';
import { subDays, addDays, startOfMonth, endOfMonth, format } from 'date-fns';

// ============================================================
// lib/shared/report-period.ts
// SINGLE SOURCE OF TRUTH for all report period calculations.
//
// Consolidates logic previously scattered across:
//   - lib/reporting-period.ts       (string-based boundaries)
//   - lib/services/date-range.ts    (DateFilter, computeDateRange)
//   - lib/dashboard/periods.ts      (async DB-backed boundaries)
//
// Supports two modes:
//   calendar_day — 00:00:00.000 – 23:59:59.999 (default)
//   hotel_day    — 12:00:00.000 today – 11:59:59.999 next day
//
// All calculations use date-fns-tz for proper timezone handling.
// No manual offset arithmetic.
// ============================================================

// ─── Types ──────────────────────────────────────────────────

/**
 * Predefined period presets for quick report period selection.
 */
export type PeriodPreset =
    | 'today'
    | 'yesterday'
    | 'last_7_days'
    | 'last_30_days'
    | 'this_month'
    | 'last_month'
    | 'custom';

/**
 * The boundary mode for report periods.
 *
 * - `calendar_day`: 00:00:00 – 23:59:59.999 in the target timezone
 * - `hotel_day`:    12:00:00 today – 11:59:59.999 next day in the target timezone
 */
export type ReportPeriodMode = 'calendar_day' | 'hotel_day';

/**
 * Input configuration for computing a report period range.
 * All fields are optional; defaults are applied for missing values.
 */
export interface ReportPeriodInput {
    /** Predefined period preset (default: 'today') */
    preset?: PeriodPreset;
    /** Start date as YYYY-MM-DD (required when preset = 'custom') */
    startDate?: string;
    /** End date as YYYY-MM-DD (required when preset = 'custom') */
    endDate?: string;
    /** Boundary mode (default: 'calendar_day') */
    mode?: ReportPeriodMode;
    /** IANA timezone string (default: 'Asia/Jakarta') */
    timezone?: string;
}

/**
 * Fully-resolved report period range with all representations.
 */
export interface ReportPeriodRange {
    /** The resolved preset (falls back to 'today' for incomplete custom input) */
    preset: PeriodPreset;
    /** The resolved boundary mode */
    mode: ReportPeriodMode;
    /** The resolved timezone */
    timezone: string;
    /** Period start as a JavaScript Date */
    start: Date;
    /** Period end as a JavaScript Date */
    end: Date;
    /** Period start as ISO 8601 string with timezone offset, e.g. "2026-06-07T00:00:00.000+07:00" */
    startISO: string;
    /** Period end as ISO 8601 string with timezone offset, e.g. "2026-06-07T23:59:59.999+07:00" (inclusive) */
    endISO: string;
    /** Start date as YYYY-MM-DD (calendar date of the period start) */
    startDate: string;
    /** End date as YYYY-MM-DD (calendar date of the period end) */
    endDate: string;
    /**
     * Exclusive end boundary as ISO 8601 string with timezone offset.
     * This is the first moment AFTER the period — use for `<` filtering in DB queries.
     * e.g. "2026-06-08T00:00:00.000+07:00" for calendar_day, "2026-06-08T12:00:00.000+07:00" for hotel_day.
     */
    endExclusiveISO: string;
    /**
     * Exclusive end date as YYYY-MM-DD.
     * The calendar date of the exclusive boundary (i.e. the day after the period ends).
     */
    endExclusiveDate: string;
    /** Human-readable label in Indonesian, e.g. "Hari Ini", "7 Hari Terakhir" */
    label: string;
}

// ─── Constants ──────────────────────────────────────────────

const DEFAULT_TIMEZONE = 'Asia/Jakarta';
const DEFAULT_PRESET: PeriodPreset = 'today';
const DEFAULT_MODE: ReportPeriodMode = 'calendar_day';

/** Indonesian labels for each preset. */
const PRESET_LABELS: Record<PeriodPreset, string> = {
    today: 'Hari Ini',
    yesterday: 'Kemarin',
    last_7_days: '7 Hari Terakhir',
    last_30_days: '30 Hari Terakhir',
    this_month: 'Bulan Ini',
    last_month: 'Bulan Lalu',
    custom: 'Kustom',
};

// ─── Internal helpers ───────────────────────────────────────

/**
 * Format a calendar boundary as an ISO 8601 string in the target timezone.
 *
 * Uses date-fns-tz getTimezoneOffset + formatInTimeZone so the result is
 * always correct for the given IANA timezone — no hardcoded offsets.
 *
 * @example
 *   isoInTimezone(2026, 5, 7, 0, 0, 0, 0, 'Asia/Jakarta')
 *   // → "2026-06-07T00:00:00.000+07:00"
 */
function isoInTimezone(
    year: number,
    month: number, // 0-based (JavaScript Date convention)
    day: number,
    hours: number,
    minutes: number,
    seconds: number,
    milliseconds: number,
    timezone: string,
): string {
    // Use noon UTC on the target date as reference to avoid DST edge cases
    const refDate = new Date(Date.UTC(year, month, day, 12));
    const tzOffsetMs = getTimezoneOffset(timezone, refDate);

    // Compute the UTC timestamp that corresponds to the desired wall-clock time
    const wallMs =
        hours * 3_600_000 +
        minutes * 60_000 +
        seconds * 1_000 +
        milliseconds;
    const utcMs = Date.UTC(year, month, day) - tzOffsetMs + wallMs;

    return formatInTimeZone(utcMs, timezone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
}

/**
 * Return the current instant shifted to the target timezone so that
 * `.getFullYear()`, `.getMonth()`, `.getDate()` reflect the wall-clock
 * date in that timezone.
 */
function getZonedNow(timezone: string): Date {
    return toZonedTime(new Date(), timezone);
}

/**
 * Build a ReportPeriodRange for a single calendar day.
 *
 * start = day@00:00:00.000, end = day@23:59:59.999.
 */
function calendarDayRange(
    date: Date,
    preset: PeriodPreset,
    mode: ReportPeriodMode,
    timezone: string,
    label: string,
): ReportPeriodRange {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();

    const startISO = isoInTimezone(y, m, d, 0, 0, 0, 0, timezone);
    const endISO = isoInTimezone(y, m, d, 23, 59, 59, 999, timezone);
    const dateStr = format(date, 'yyyy-MM-dd');

    const nextDate = addDays(date, 1);
    const ny = nextDate.getFullYear();
    const nm = nextDate.getMonth();
    const nd = nextDate.getDate();
    const endExclusiveISO = isoInTimezone(ny, nm, nd, 0, 0, 0, 0, timezone);
    const endExclusiveDate = format(nextDate, 'yyyy-MM-dd');

    return {
        preset,
        mode,
        timezone,
        start: new Date(startISO),
        end: new Date(endISO),
        startISO,
        endISO,
        startDate: dateStr,
        endDate: dateStr,
        endExclusiveISO,
        endExclusiveDate,
        label,
    };
}

/**
 * Build a ReportPeriodRange for a single hotel day.
 *
 * start = day@12:00:00.000, end = next-day@11:59:59.999.
 */
function hotelDayRange(
    date: Date,
    preset: PeriodPreset,
    mode: ReportPeriodMode,
    timezone: string,
    label: string,
): ReportPeriodRange {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();

    const startISO = isoInTimezone(y, m, d, 12, 0, 0, 0, timezone);

    const nextDate = addDays(date, 1);
    const ny = nextDate.getFullYear();
    const nm = nextDate.getMonth();
    const nd = nextDate.getDate();
    const endISO = isoInTimezone(ny, nm, nd, 11, 59, 59, 999, timezone);

    // Exclusive end = next hotel day start (nextDate @ 12:00:00.000)
    const endExclusiveISO = isoInTimezone(ny, nm, nd, 12, 0, 0, 0, timezone);
    // Exclusive end date = the day after endDate (the calendar date of endExclusiveISO)
    const endExclusiveDate = format(nextDate, 'yyyy-MM-dd');

    return {
        preset,
        mode,
        timezone,
        start: new Date(startISO),
        end: new Date(endISO),
        startISO,
        endISO,
        startDate: format(date, 'yyyy-MM-dd'),
        endDate: format(nextDate, 'yyyy-MM-dd'),
        endExclusiveISO,
        endExclusiveDate,
        label,
    };
}

/**
 * Build a ReportPeriodRange spanning multiple days.
 *
 * calendar_day: start = firstDay@00:00:00.000, end = lastDay@23:59:59.999.
 * hotel_day:    start = firstDay@12:00:00.000, end = dayAfterLast@11:59:59.999.
 */
function multiDayRange(
    startDate: Date,
    endDate: Date,
    preset: PeriodPreset,
    mode: ReportPeriodMode,
    timezone: string,
    label: string,
): ReportPeriodRange {
    if (mode === 'hotel_day') {
        const startY = startDate.getFullYear();
        const startM = startDate.getMonth();
        const startD = startDate.getDate();
        const startISO = isoInTimezone(startY, startM, startD, 12, 0, 0, 0, timezone);

        const dayAfterEnd = addDays(endDate, 1);
        const endY = dayAfterEnd.getFullYear();
        const endM = dayAfterEnd.getMonth();
        const endD = dayAfterEnd.getDate();
        const endISO = isoInTimezone(endY, endM, endD, 11, 59, 59, 999, timezone);

        // Exclusive end = day after the period end @ 12:00:00.000 (next hotel day start)
        const endExclusiveISO = isoInTimezone(endY, endM, endD, 12, 0, 0, 0, timezone);
        const endExclusiveDate = format(dayAfterEnd, 'yyyy-MM-dd');

        return {
            preset,
            mode,
            timezone,
            start: new Date(startISO),
            end: new Date(endISO),
            startISO,
            endISO,
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
            endExclusiveISO,
            endExclusiveDate,
            label,
        };
    }

    // calendar_day
    const startY = startDate.getFullYear();
    const startM = startDate.getMonth();
    const startD = startDate.getDate();
    const startISO = isoInTimezone(startY, startM, startD, 0, 0, 0, 0, timezone);

    const endY = endDate.getFullYear();
    const endM = endDate.getMonth();
    const endD = endDate.getDate();
    const endISO = isoInTimezone(endY, endM, endD, 23, 59, 59, 999, timezone);

    // Exclusive end = day after endDate @ 00:00:00.000
    const dayAfterEnd = addDays(endDate, 1);
    const excY = dayAfterEnd.getFullYear();
    const excM = dayAfterEnd.getMonth();
    const excD = dayAfterEnd.getDate();
    const endExclusiveISO = isoInTimezone(excY, excM, excD, 0, 0, 0, 0, timezone);
    const endExclusiveDate = format(dayAfterEnd, 'yyyy-MM-dd');

    return {
        preset,
        mode,
        timezone,
        start: new Date(startISO),
        end: new Date(endISO),
        startISO,
        endISO,
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        endExclusiveISO,
        endExclusiveDate,
        label,
    };
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Compute a fully-resolved {@link ReportPeriodRange} from optional input.
 *
 * This is the **single source of truth** for all report period calculations
 * in the KR Analytics Dashboard. Every page, server action, and KPI query
 * should derive its date boundaries from this function.
 *
 * @param input - Optional configuration. All fields have sensible defaults.
 * @returns A complete ReportPeriodRange with Date objects, ISO strings,
 *          YYYY-MM-DD strings, and a human-readable Indonesian label.
 *
 * @example
 *   // Today, calendar day (all defaults)
 *   getReportPeriodRange()
 *
 * @example
 *   // Today, hotel day
 *   getReportPeriodRange({ preset: 'today', mode: 'hotel_day' })
 *
 * @example
 *   // Last 7 days
 *   getReportPeriodRange({ preset: 'last_7_days' })
 *
 * @example
 *   // Custom date range
 *   getReportPeriodRange({
 *     preset: 'custom',
 *     startDate: '2026-06-01',
 *     endDate: '2026-06-05',
 *   })
 *
 * @example
 *   // Last month with hotel day boundaries
 *   getReportPeriodRange({ preset: 'last_month', mode: 'hotel_day' })
 */
export function getReportPeriodRange(
    input?: ReportPeriodInput,
): ReportPeriodRange {
    const preset = input?.preset ?? DEFAULT_PRESET;
    const mode = input?.mode ?? DEFAULT_MODE;
    const timezone = input?.timezone ?? DEFAULT_TIMEZONE;
    const label = PRESET_LABELS[preset];

    const now = getZonedNow(timezone);

    switch (preset) {
        // ── Single-day presets ──────────────────────────────
        case 'today': {
            if (mode === 'hotel_day') {
                return hotelDayRange(now, preset, mode, timezone, label);
            }
            return calendarDayRange(now, preset, mode, timezone, label);
        }

        case 'yesterday': {
            const yesterday = subDays(now, 1);
            if (mode === 'hotel_day') {
                return hotelDayRange(yesterday, preset, mode, timezone, label);
            }
            return calendarDayRange(yesterday, preset, mode, timezone, label);
        }

        // ── Multi-day presets ───────────────────────────────
        case 'last_7_days': {
            const start = subDays(now, 6); // 7 days: today and 6 days before
            return multiDayRange(start, now, preset, mode, timezone, label);
        }

        case 'last_30_days': {
            const start = subDays(now, 29); // 30 days: today and 29 days before
            return multiDayRange(start, now, preset, mode, timezone, label);
        }

        case 'this_month': {
            const monthStart = startOfMonth(now);
            return multiDayRange(monthStart, now, preset, mode, timezone, label);
        }

        case 'last_month': {
            // Step back one day from the first of this month to land in the previous month
            const prevMonthRef = subDays(startOfMonth(now), 1);
            const monthStart = startOfMonth(prevMonthRef);
            const monthEnd = endOfMonth(prevMonthRef);
            return multiDayRange(monthStart, monthEnd, preset, mode, timezone, label);
        }

        case 'custom': {
            const startDateStr = input?.startDate;
            const endDateStr = input?.endDate;

            if (!startDateStr || !endDateStr) {
                // Incomplete custom input → fall back to today
                return calendarDayRange(now, 'today', mode, timezone, PRESET_LABELS.today);
            }

            // Parse YYYY-MM-DD into timezone-aware Date objects.
            // Using noon UTC avoids any DST edge-case where midnight might
            // map to a different calendar day.
            const start = toZonedTime(
                new Date(`${startDateStr}T12:00:00.000Z`),
                timezone,
            );
            const end = toZonedTime(
                new Date(`${endDateStr}T12:00:00.000Z`),
                timezone,
            );

            return multiDayRange(start, end, preset, mode, timezone, label);
        }
    }
}
