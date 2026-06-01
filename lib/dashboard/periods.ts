import { getReportPeriodRange } from '@/lib/reporting-period';
import { getReportPeriodSetting as getReportPeriodSettingFn } from '@/lib/get-report-period-setting';
import type { ReportPeriodMode } from '@/lib/reporting-period';
import { subDays } from 'date-fns';

// ============================================================
// lib/dashboard/periods.ts
// Single Source of Truth for report period date boundaries.
//
// All dashboard/action files MUST use these functions instead of
// constructing inline date strings like `${today}T00:00:00`.
//
// Delegates to:
//   - lib/reporting-period.ts     (getReportPeriodRange)
//   - lib/get-report-period-setting.ts (getReportPeriodSetting)
//
// All calculations use Asia/Jakarta (WIB, UTC+7) timezone.
// ============================================================

// ─── Request-scoped dedup cache ────────────────────────────
// Module-level variable caches report_period_mode per request.
// Next.js server components/actions get fresh module scope per request,
// so this is effectively request-scoped without explicit clearing.
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

// ─── Public boundary functions ─────────────────────────────

/**
 * Get today's report period boundaries as Date objects.
 * Respects report_period_mode (calendar_day or hotel_day).
 *
 * calendar_day: dayStart=00:00 WIB, dayEnd=23:59 WIB
 * hotel_day:    dayStart=12:00 WIB today, dayEnd=11:59 WIB next day
 */
export async function getTodayBoundaries(): Promise<{ dayStart: Date; dayEnd: Date }> {
    const mode = await getMode();
    const range = getReportPeriodRange(new Date(), mode);
    return {
        dayStart: new Date(range.start),
        dayEnd: new Date(range.end),
    };
}

/**
 * Get report period boundaries for any date as Date objects.
 * Respects report_period_mode.
 */
export async function getDateBoundaries(date: Date): Promise<{ dayStart: Date; dayEnd: Date }> {
    const mode = await getMode();
    const range = getReportPeriodRange(date, mode);
    return {
        dayStart: new Date(range.start),
        dayEnd: new Date(range.end),
    };
}

/**
 * Get report period boundaries for any date as ISO strings (with timezone offset).
 * Ready to use directly in Supabase .gte()/.lte() filters.
 * Respects report_period_mode.
 *
 * Example return (calendar_day):
 *   { startISO: "2026-05-30T00:00:00.000+07:00", endISO: "2026-05-30T23:59:59.999+07:00" }
 */
export async function getDateBoundariesISO(date: Date): Promise<{ startISO: string; endISO: string }> {
    const mode = await getMode();
    const range = getReportPeriodRange(date, mode);
    return {
        startISO: range.start,
        endISO: range.end,
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
    const range = getReportPeriodRange(date, 'calendar_day');
    return {
        dayStart: new Date(range.start),
        dayEnd: new Date(range.end),
    };
}

/**
 * Get ISO boundaries for a comparison date (N days before today).
 * Respects report_period_mode.
 */
export async function getComparisonRange(daysOffset: number): Promise<{ startISO: string; endISO: string }> {
    const mode = await getMode();
    const date = subDays(new Date(), daysOffset);
    const range = getReportPeriodRange(date, mode);
    return {
        startISO: range.start,
        endISO: range.end,
    };
}
