import { queryAnalytics } from './db';
import type { OccupancyDaily } from './types';

/**
 * ─── Occupancy Definition ───
 *
 * A room is considered **occupied** on a given date (WIB) if there is at least
 * one transaction recorded for that room on that date, based on
 * `(created_at AT TIME ZONE 'Asia/Jakarta')::DATE`.
 *
 * This is computed during the summary refresh in the sync-worker and stored in
 * `analytics_occupancy_daily.is_occupied`.
 *
 * The table stores one row per (date_wib, apartment_location, room_number).
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
    return queryAnalytics<{
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
        averageOccupancyRate: parseFloat(row.avg_occupancy),
        totalRoomDays: parseInt(row.total_room_days, 10),
        totalOccupiedRoomDays: parseInt(row.total_occupied, 10),
    };
}
