import { queryAnalytics, parseNumeric } from './db';
import type { OccupancyDaily } from './types';

/**
 * ─── Occupancy Definition: Daily Occupancy Boolean / Room-Day Utilization ───
 *
 * `analytics_occupancy_daily` stores **daily occupancy boolean** — whether a
 * specific room was occupied at any point during a given calendar day (WIB).
 *
 * ## Grain
 * 1 row per `(date_wib, apartment_location, room_number)`.
 * No duplicate rows for the same room-date.
 *
 * ## Same-Day Transit / Usage
 * - A unit used for even 1 transit (≥3 hours) on a date counts as 1 occupied
 *   room-day.
 * - If a unit is used **multiple times** on the same date (e.g., 3 transits),
 *   it still produces only **1 occupied room-day** row.
 * - **Do NOT** count rows in `analytics_occupancy_daily` to compute usage
 *   frequency or unit turnover. That is a separate metric.
 *
 * ## Metadata Columns (Debug / Sample Only)
 * - `transaction_id`, `customer_name`, `checkin_at`, `checkout_at` are
 *   **sample metadata** for the room-date, populated from the latest
 *   transaction (deterministic via `DISTINCT ON ... ORDER BY transaction_id DESC`).
 * - Because multiple transactions can overlap the same room-date, these fields
 *   are **not** authoritative for usage frequency counting.
 *
 * ## Active Stay (`checkout_at IS NULL`) Policy
 * - Active stays are counted up to **yesterday WIB**:
 *   `(NOW() AT TIME ZONE 'Asia/Jakarta')::DATE - 1`
 * - Daily analytics only covers **completed calendar days**.
 * - Today's active occupancy is NOT in `analytics_occupancy_daily`.
 * - For current/live occupancy (right now), use `getLiveOccupancy()`.
 *
 * ## Usage Frequency (Separate Metric)
 * - Frequency / unit turnover / usage count is a **different metric**
 *   and will be handled in a separate table (e.g. `analytics_unit_usage_daily`).
 * - Until then, do NOT derive frequency from occupancy daily rows.
 *
 * ## Related
 * - Live occupancy (point-in-time): `getLiveOccupancy()` in `lib/services/occupancy.ts`
 * - Stay-span overlap model using `generate_series()` in `sync-worker/src/sync/summary.ts`
 */

function getDefaultDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const end = new Date(wib);
    end.setDate(end.getDate() + 1);
    const start = new Date(wib);
    start.setDate(start.getDate() - 30);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

function nextDay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00+07:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function resolveRange(startDate?: string, endDate?: string) {
    if (startDate) return { startDate, endDate: endDate ?? nextDay(startDate) };
    return getDefaultDateRange();
}

/**
 * Fetch daily occupancy rows for a date range.
 * Defaults to last 30 days (WIB).
 */
export async function getOccupancyDaily(
    startDate?: string,
    endDate?: string
): Promise<OccupancyDaily[]> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
    return queryAnalytics<OccupancyDaily>(
        `SELECT *
     FROM analytics_occupancy_daily
     WHERE date_wib >= $1 AND date_wib < $2
     ORDER BY date_wib, apartment_location, room_number`,
        [sd, ed]
    );
}

/**
 * Get occupancy rate per location per date.
 * Returns fraction 0..1.
 */
export async function getOccupancyRate(
    startDate?: string,
    endDate?: string
): Promise<
    Array<{
        date_wib: string;
        apartment_location: string;
        total_rooms: number;
        occupied_rooms: number;
        occupancy_rate: number;
    }>
> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
    const rows = await queryAnalytics<{
        date_wib: string;
        apartment_location: string;
        total_rooms: number;
        occupied_rooms: number;
        occupancy_rate: number;
    }>(
        `SELECT
       date_wib,
       apartment_location,
       COUNT(*)                                       AS total_rooms,
       COUNT(*) FILTER (WHERE is_occupied)            AS occupied_rooms,
       ROUND(
         COUNT(*) FILTER (WHERE is_occupied)::numeric /
         NULLIF(COUNT(*), 0),
         4
       )                                              AS occupancy_rate
     FROM analytics_occupancy_daily
     WHERE date_wib >= $1 AND date_wib < $2
     GROUP BY date_wib, apartment_location
     ORDER BY date_wib, apartment_location`,
        [sd, ed]
    );
    return rows.map(r => ({
        date_wib: r.date_wib,
        apartment_location: r.apartment_location,
        total_rooms: parseNumeric(r.total_rooms),
        occupied_rooms: parseNumeric(r.occupied_rooms),
        occupancy_rate: parseNumeric(r.occupancy_rate),
    }));
}

/**
 * Get overall occupancy summary for the date range.
 */
export async function getOccupancySummary(
    startDate?: string,
    endDate?: string
): Promise<{
    startDate: string;
    endDate: string;
    averageOccupancyRate: number;
    totalRoomDays: number;
    totalOccupiedRoomDays: number;
}> {
    const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
    const rows = await queryAnalytics<{
        total_room_days: string;
        total_occupied: string;
        avg_occupancy: string;
    }>(
        `SELECT
       COUNT(*)::text                                AS total_room_days,
       COUNT(*) FILTER (WHERE is_occupied)::text     AS total_occupied,
       ROUND(
         AVG(CASE WHEN is_occupied THEN 1.0 ELSE 0.0 END),
         4
       )::text                                       AS avg_occupancy
     FROM analytics_occupancy_daily
     WHERE date_wib >= $1 AND date_wib < $2`,
        [sd, ed]
    );
    const row = rows[0];
    return {
        startDate: sd,
        endDate: ed,
        averageOccupancyRate: parseNumeric(row.avg_occupancy),
        totalRoomDays: parseNumeric(row.total_room_days),
        totalOccupiedRoomDays: parseNumeric(row.total_occupied),
    };
}
