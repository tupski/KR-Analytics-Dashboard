/**
 * Regression test: getTodayReportRange() exclusive-end date boundary.
 *
 * Bug (pre-fix): the exclusive end was built by taking the inclusive end,
 * adding 1 ms, converting to a UTC ISO string and relabeling "Z" as "+07:00".
 * For 13 Oct 2026 that produced "2026-10-13T17:00:00.000+07:00" — 7 hours
 * early — silently truncating "today" for KPI/revenue queries.
 *
 * Expected: the exclusive end is the next WIB midnight,
 * "2026-10-14T00:00:00.000+07:00".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTodayReportRange } from './get-report-period-setting';
import { clearEgressCache } from './egress-cache';

// No database in unit tests: stub the app_settings read as 'calendar_day'.
vi.mock('@/lib/supabase/server', () => ({
    createServerClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: { value: 'calendar_day' } }),
                }),
            }),
        }),
    }),
}));

describe('getTodayReportRange — exclusive end (regression)', () => {
    beforeEach(() => {
        clearEgressCache();
        vi.useFakeTimers();
        // 13 October 2026, 10:00 Asia/Jakarta (mid-day: unambiguous)
        vi.setSystemTime(new Date('2026-10-13T10:00:00.000+07:00'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calendar_day: next WIB midnight, not a UTC relabel', async () => {
        const { start, end, endExclusiveISO } = await getTodayReportRange();

        // Inclusive bounds are unchanged by the fix.
        expect(start).toBe('2026-10-13T00:00:00.000+07:00');
        expect(end).toBe('2026-10-13T23:59:59.999+07:00');

        // Exclusive end = first moment after the day.
        expect(endExclusiveISO).toBe('2026-10-14T00:00:00.000+07:00');

        // Must never regress to the old UTC-relabeled value (7 hours early).
        expect(endExclusiveISO).not.toBe('2026-10-13T17:00:00.000+07:00');
    });
});
