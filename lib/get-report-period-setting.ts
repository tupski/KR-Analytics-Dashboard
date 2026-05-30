import { createServerClient } from '@/lib/supabase/server';
import { DEFAULT_REPORT_PERIOD, getReportPeriodRange } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';

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
 */
export async function getReportPeriodSetting(): Promise<ReportPeriodMode> {
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
}

/**
 * Get today's report period range using the DB setting.
 * Convenience wrapper used in dashboard/actions.ts to replace getHotelDayRange().
 */
export async function getTodayReportRange(): Promise<{ start: string; end: string }> {
    const mode = await getReportPeriodSetting();
    return getReportPeriodRange(new Date(), mode);
}
