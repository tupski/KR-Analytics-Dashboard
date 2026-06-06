/**
 * @deprecated Import from `@/lib/shared/report-period` instead.
 *
 * This file is kept for backward compatibility only.
 * All new code should use the single source of truth:
 *
 *   import { getReportPeriodRange } from '@/lib/shared/report-period';
 *   import type { ReportPeriodInput, ReportPeriodRange } from '@/lib/shared/report-period';
 *
 * The original async DB-backed helpers (getTodayBoundaries, getDateBoundariesISO, etc.)
 * continue to work but delegate to the shared utility internally.
 */

// ─── Re-export types and the main function from the new shared location ────
export {
    getReportPeriodRange,
} from '@/lib/shared/report-period';

export type {
    PeriodPreset,
    ReportPeriodMode,
    ReportPeriodInput,
    ReportPeriodRange,
} from '@/lib/shared/report-period';

// ─── Existing async DB-backed helpers (unchanged, for backward compat) ────

import { getReportPeriodRange as getSharedRange } from '@/lib/shared/report-period';
import { getReportPeriodSetting as getReportPeriodSettingFn } from '@/lib/get-report-period-setting';
import { subDays, format } from 'date-fns';
import type { ReportPeriodMode } from '@/lib/shared/report-period';

// Request-scoped dedup cache
let _cachedMode: ReportPeriodMode | null = null;

async function getMode(): Promise<ReportPeriodMode> {
    if (!_cachedMode) {
        _cachedMode = await getReportPeriodSettingFn();
    }
    return _cachedMode;
}

/**
 * Reset the cached period mode. Used internally for testing or when
 * the setting may have changed mid-request (rare).
 */
export function resetCachedMode(): void {
    _cachedMode = null;
}

/**
 * Get today's report period boundaries as Date objects.
 * Respects report_period_mode (calendar_day or hotel_day).
 *
 * calendar_day: dayStart=00:00 WIB, dayEnd=23:59 WIB
 * hotel_day:    dayStart=12:00 WIB today, dayEnd=11:59 WIB next day
 *
 * @deprecated Prefer using getReportPeriodRange() directly from @/lib/shared/report-period.
 */
export async function getTodayBoundaries(): Promise<{ dayStart: Date; dayEnd: Date }> {
    const mode = await getMode();
    const range = getSharedRange({ preset: 'today', mode });
    return {
        dayStart: range.start,
        dayEnd: range.end,
    };
}

/**
 * Get report period boundaries for any date as Date objects.
 * Respects report_period_mode.
 *
 * @deprecated Prefer using getReportPeriodRange() directly from @/lib/shared/report-period.
 */
export async function getDateBoundaries(date: Date): Promise<{ dayStart: Date; dayEnd: Date }> {
    const mode = await getMode();
    const dateStr = format(date, 'yyyy-MM-dd');
    const range = getSharedRange({ preset: 'custom', startDate: dateStr, endDate: dateStr, mode });
    return {
        dayStart: range.start,
        dayEnd: range.end,
    };
}

/**
 * Get report period boundaries for any date as ISO strings (with timezone offset).
 * Ready to use directly in Supabase .gte()/.lte() filters.
 * Respects report_period_mode.
 *
 * Example return (calendar_day):
 *   { startISO: "2026-05-30T00:00:00.000+07:00", endISO: "2026-05-30T23:59:59.999+07:00" }
 *
 * @deprecated Prefer using getReportPeriodRange() directly from @/lib/shared/report-period.
 */
export async function getDateBoundariesISO(date: Date): Promise<{ startISO: string; endISO: string; endExclusiveISO: string }> {
    const mode = await getMode();
    const dateStr = format(date, 'yyyy-MM-dd');
    const range = getSharedRange({ preset: 'custom', startDate: dateStr, endDate: dateStr, mode });
    return {
        startISO: range.startISO,
        endISO: range.endISO,
        endExclusiveISO: range.endExclusiveISO,
    };
}

/**
 * Get current occupancy window: current timestamp for point-in-time queries.
 * Use with: checkin_at ≤ now AND (checkout_at ≥ now OR checkout_at IS NULL)
 */
export function getOccupancyNowWindow(): { now: Date } {
    return { now: new Date() };
}

/**
 * Get occupancy window for a specific date (overlap-based).
 *
 * Uses calendar_day boundaries (00:00-23:59 WIB) because physical room
 * occupancy spans the full calendar day regardless of report_period_mode.
 *
 * A stay overlaps this window if:
 *   checkin_at ≤ dayEnd AND (checkout_at ≥ dayStart OR checkout_at IS NULL)
 */
export async function getOccupancyWindow(date: Date): Promise<{ dayStart: Date; dayEnd: Date }> {
    // Intentional: occupancy always uses full calendar day
    const dateStr = format(date, 'yyyy-MM-dd');
    const range = getSharedRange({ preset: 'custom', startDate: dateStr, endDate: dateStr, mode: 'calendar_day' });
    return {
        dayStart: range.start,
        dayEnd: range.end,
    };
}

/**
 * Get ISO boundaries for a comparison date (N days before today).
 * Respects report_period_mode.
 *
 * @deprecated Prefer using getReportPeriodRange() directly from @/lib/shared/report-period.
 */
export async function getComparisonRange(daysOffset: number): Promise<{ startISO: string; endISO: string; endExclusiveISO: string }> {
    const mode = await getMode();
    const date = subDays(new Date(), daysOffset);
    const dateStr = format(date, 'yyyy-MM-dd');
    const range = getSharedRange({ preset: 'custom', startDate: dateStr, endDate: dateStr, mode });
    return {
        startISO: range.startISO,
        endISO: range.endISO,
        endExclusiveISO: range.endExclusiveISO,
    };
}
