import { createServerClient } from '@/lib/supabase/server';
import { DEFAULT_REPORT_PERIOD, getReportPeriodRange } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';
import { withEgressCache } from '@/lib/egress-cache';
import { CACHE_TTL } from '@/lib/config/constants';

// ============================================================
// lib/get-report-period-setting.ts
// Server-side helper to fetch report_period_mode from DB.
//
// Used by server actions (dashboard, laporan) and server components.
// Avoids repeating the app_settings query in every action file.
// ============================================================

/**
 * Fetch report_period_mode from app_settings table (server-only).
 * Falls back to DEFAULT_REPORT_PERIOD if not set or on error.
 *
 * M2 egress: cached 5m — the app_settings row is RLS-identical across all
 * authenticated users (no per-user filter). Downstream effect: a report-period
 * mode change takes up to 5 minutes to propagate across the app.
 */
export async function getReportPeriodSetting(): Promise<ReportPeriodMode> {
    return withEgressCache(
        'egress:app_settings:report-period',
        CACHE_TTL.DASHBOARD_TODAY,
        async () => {
            try {
                const supabase = createServerClient();
                const { data } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'report_period_mode')
                    .maybeSingle();

                if (data?.value === 'calendar_day' || data?.value === 'hotel_day') {
                    return data.value as ReportPeriodMode;
                }
                return DEFAULT_REPORT_PERIOD;
            } catch {
                // If DB is unavailable, fall back to default
                return DEFAULT_REPORT_PERIOD;
            }
        },
    );
}

/**
 * Get today's report period range using the DB setting.
 * Convenience wrapper used in dashboard/actions.ts to replace getHotelDayRange().
 *
 * Returns start (inclusive), end (inclusive), and endExclusiveISO for `<` DB queries.
 */
export async function getTodayReportRange(): Promise<{ start: string; end: string; endExclusiveISO: string }> {
    const mode = await getReportPeriodSetting();
    const range = getReportPeriodRange(new Date(), mode);
    // Compute exclusive end from the inclusive end by adding 1 ms
    const endExclusiveISO = new Date(new Date(range.end).getTime() + 1).toISOString().replace('.000Z', '.000+07:00');
    return { start: range.start, end: range.end, endExclusiveISO };
}
