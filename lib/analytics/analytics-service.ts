import { queryAnalytics, parseNumeric, parseNullableNumeric } from './db';
import type {
  DailyRevenueTrend,
  ProfitPerLocation,
  GuestSourceSummary,
  OccupancyPerUnit,
  CheckinHeatmap,
  LocationFullness,
  StayDurationSummary,
  RepeatGuest,
} from './types';

// ────────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────────

/**
 * Default 30-day range ending today (WIB). endDate is exclusive.
 */
function defaultRange(): { startDate: string; endDate: string } {
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

function resolveRange(
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string } {
  if (startDate) {
    return { startDate, endDate: endDate ?? nextDay(startDate) };
  }
  return defaultRange();
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 1: getDailyRevenueTrend
// ────────────────────────────────────────────────────────────────

export async function getDailyRevenueTrend(
  startDate?: string,
  endDate?: string,
  location?: string | null,
): Promise<DailyRevenueTrend[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    transaction_date: string;
    total_revenue: string;
    transaction_count: number;
    avg_revenue_per_transaction: string;
    total_count: number;
  }>(
    `WITH aggregated AS (
          SELECT
            (DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta'))::TEXT AS transaction_date,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS total_revenue,
            COUNT(*) AS transaction_count
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::TEXT IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
          GROUP BY DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
        ),
        counted AS (
          SELECT COUNT(*) AS cnt FROM aggregated
        )
        SELECT
          a.transaction_date,
          a.total_revenue,
          a.transaction_count,
          ROUND(a.total_revenue / NULLIF(a.transaction_count, 0), 2) AS avg_revenue_per_transaction,
          c.cnt AS total_count
        FROM aggregated a, counted c
        ORDER BY a.transaction_date DESC
        LIMIT $4 OFFSET $5`,
    [sd, ed, location ?? null, 365, 0],
  );

  return rows.map((r) => ({
    transaction_date: String(r.transaction_date ?? ''),
    total_revenue: parseNumeric(r.total_revenue),
    transaction_count: parseNumeric(r.transaction_count),
    avg_revenue_per_transaction: parseNumeric(r.avg_revenue_per_transaction),
    total_count: parseNumeric(r.total_count),
  }));
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 2: getProfitPerLocation
// ────────────────────────────────────────────────────────────────

export async function getProfitPerLocation(
  startDate?: string,
  endDate?: string,
  location?: string | null,
): Promise<ProfitPerLocation[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    apartment_location: string;
    total_revenue: string;
    total_transactions: number;
    avg_revenue_per_transaction: string;
  }>(
    `SELECT
          t.apartment_location::TEXT,
          ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS total_revenue,
          COUNT(*) AS total_transactions,
          ROUND(SUM(t.cash_amount + t.transfer_amount) / NULLIF(COUNT(*), 0), 2) AS avg_revenue_per_transaction
        FROM transactions t
        WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
          AND ($3::TEXT IS NULL OR t.apartment_location = $3)
          AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
        GROUP BY t.apartment_location
        ORDER BY total_revenue DESC`,
    [sd, ed, location ?? null],
  );

  return rows.map((r) => ({
    apartment_location: r.apartment_location,
    total_revenue: parseNumeric(r.total_revenue),
    total_transactions: parseNumeric(r.total_transactions),
    avg_revenue_per_transaction: parseNumeric(r.avg_revenue_per_transaction),
  }));
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 3: getGuestSourceSummary
// ────────────────────────────────────────────────────────────────

export async function getGuestSourceSummary(
  startDate?: string,
  endDate?: string,
  location?: string | null,
  limit: number = 10,
  offset: number = 0,
): Promise<GuestSourceSummary[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    source_name: string;
    transaction_count: number;
    total_revenue: string;
    percentage: string;
    total_count: number;
  }>(
    `WITH aggregated AS (
          SELECT
            COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')::TEXT AS source_name,
            COUNT(*) AS tx_count,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS revenue
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::TEXT IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
          GROUP BY COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')
        ),
        grand_total AS (
          SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
        ),
        counted AS (
          SELECT COUNT(*) AS cnt FROM aggregated
        )
        SELECT
          a.source_name,
          a.tx_count AS transaction_count,
          a.revenue AS total_revenue,
          ROUND(a.tx_count::numeric / NULLIF(g.total, 0) * 100, 2) AS percentage,
          c.cnt AS total_count
        FROM aggregated a, grand_total g, counted c
        ORDER BY a.tx_count DESC, a.source_name
        LIMIT $4 OFFSET $5`,
    [sd, ed, location ?? null, limit, offset],
  );

  return rows.map((r) => ({
    source_name: r.source_name,
    transaction_count: parseNumeric(r.transaction_count),
    total_revenue: parseNumeric(r.total_revenue),
    percentage: parseNumeric(r.percentage),
    total_count: parseNumeric(r.total_count),
  }));
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 4: getOccupancyPerUnit
// ────────────────────────────────────────────────────────────────

export async function getOccupancyPerUnit(
  startDate?: string,
  endDate?: string,
  location?: string | null,
  limit: number = 10,
  offset: number = 0,
): Promise<OccupancyPerUnit[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    room_number: string;
    apartment_location: string;
    total_transactions: number;
    total_revenue: string;
    occupancy_rate: string;
    total_count: number;
  }>(
    `WITH aggregated AS (
          SELECT
            t.room_number,
            t.apartment_location::TEXT,
            COUNT(*) AS tx_count,
            ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS revenue,
            COUNT(DISTINCT DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')) AS occupied_days
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::TEXT IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
          GROUP BY t.room_number, t.apartment_location
        ),
        counted AS (
          SELECT COUNT(*) AS cnt FROM aggregated
        )
        SELECT
          a.room_number,
          a.apartment_location,
          a.tx_count AS total_transactions,
          a.revenue AS total_revenue,
          ROUND(a.occupied_days::numeric / NULLIF(($2::date - $1::date + 1), 0) * 100, 2) AS occupancy_rate,
          c.cnt AS total_count
        FROM aggregated a, counted c
        ORDER BY a.tx_count DESC, a.room_number
        LIMIT $4 OFFSET $5`,
    [sd, ed, location ?? null, limit, offset],
  );

  return rows.map((r) => ({
    room_number: r.room_number,
    apartment_location: r.apartment_location,
    total_transactions: parseNumeric(r.total_transactions),
    total_revenue: parseNumeric(r.total_revenue),
    occupancy_rate: parseNumeric(r.occupancy_rate),
    total_count: parseNumeric(r.total_count),
  }));
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 5: getCheckinHeatmap
// ────────────────────────────────────────────────────────────────

export async function getCheckinHeatmap(
  startDate?: string,
  endDate?: string,
  location?: string | null,
): Promise<CheckinHeatmap[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    hour: number;
    transaction_count: number;
    percentage: string;
  }>(
    `WITH hours AS (
          SELECT generate_series(0, 23) AS h
        ),
        checkins AS (
          SELECT
            EXTRACT(HOUR FROM t.checkin_at AT TIME ZONE 'Asia/Jakarta')::INT AS h,
            COUNT(*) AS cnt
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::text IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
          GROUP BY EXTRACT(HOUR FROM t.checkin_at AT TIME ZONE 'Asia/Jakarta')::INT
        ),
        total AS (
          SELECT COALESCE(SUM(cnt), 0) AS grand_total FROM checkins
        )
        SELECT
          hours.h AS hour,
          COALESCE(checkins.cnt, 0) AS transaction_count,
          ROUND(COALESCE(checkins.cnt, 0)::numeric / NULLIF(total.grand_total, 0) * 100, 2) AS percentage
        FROM hours
        LEFT JOIN checkins ON checkins.h = hours.h
        CROSS JOIN total
        ORDER BY hours.h`,
    [sd, ed, location ?? null],
  );

  return rows.map((r) => ({
    hour: r.hour,
    transaction_count: parseNumeric(r.transaction_count),
    percentage: parseNumeric(r.percentage),
  }));
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 6: getLocationFullness
// ────────────────────────────────────────────────────────────────

export async function getLocationFullness(
  startDate?: string,
  endDate?: string,
  location?: string | null,
): Promise<LocationFullness[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    apartment_location: string;
    total_rooms: number;
    peak_occupancy_rate: string | null;
    avg_occupancy_rate: string | null;
    total_transactions: number;
  }>(
    `WITH period_days AS (
          SELECT ($2::date - $1::date + 1) AS total_days
        ),
        inferred_rooms AS (
          SELECT t.apartment_location, COUNT(DISTINCT t.room_number)::INT AS rooms_count
          FROM transactions t
          WHERE (t.is_deleted = FALSE OR t.is_deleted IS NULL)
          GROUP BY t.apartment_location
        ),
        locations AS (
          SELECT
            la.name::TEXT AS apartment_location,
            COALESCE(NULLIF(la.total_rooms, 0), ir.rooms_count, 0) AS total_rooms
          FROM lokasi_apartemen la
          LEFT JOIN inferred_rooms ir ON ir.apartment_location = la.name
          WHERE ($3::TEXT IS NULL OR la.name = $3)
            AND (la.is_deleted = FALSE OR la.is_deleted IS NULL)
        ),
        daily_occupancy AS (
          SELECT
            t.apartment_location,
            DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') AS checkin_date,
            COUNT(DISTINCT t.room_number) AS rooms_occupied
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::TEXT IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
          GROUP BY t.apartment_location, DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
        ),
        location_stats AS (
          SELECT
            t.apartment_location,
            COUNT(*) AS total_transactions
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::TEXT IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
          GROUP BY t.apartment_location
        )
        SELECT
          loc.apartment_location,
          loc.total_rooms,
          CASE WHEN loc.total_rooms = 0
            THEN NULL::numeric
            ELSE ROUND(COUNT(*) FILTER (WHERE do_data.rooms_occupied >= loc.total_rooms)::numeric / NULLIF(pd.total_days, 0) * 100, 2)
          END AS peak_occupancy_rate,
          CASE WHEN loc.total_rooms = 0
            THEN NULL::numeric
            ELSE ROUND(SUM(do_data.rooms_occupied::numeric / NULLIF(loc.total_rooms, 0) * 100) / NULLIF(pd.total_days, 0), 2)
          END AS avg_occupancy_rate,
          COALESCE(ls.total_transactions, 0) AS total_transactions
        FROM locations loc
        LEFT JOIN daily_occupancy do_data ON do_data.apartment_location = loc.apartment_location
        LEFT JOIN location_stats ls ON ls.apartment_location = loc.apartment_location
        CROSS JOIN period_days pd
        GROUP BY loc.apartment_location, loc.total_rooms, ls.total_transactions, pd.total_days
        ORDER BY
          CASE WHEN loc.total_rooms = 0 THEN NULL ELSE
            ROUND(SUM(do_data.rooms_occupied::numeric / NULLIF(loc.total_rooms, 0) * 100) / NULLIF(pd.total_days, 0), 2)
          END DESC NULLS LAST,
          loc.apartment_location`,
    [sd, ed, location ?? null],
  );

  return rows.map((r, i, arr) => ({
    apartment_location: r.apartment_location,
    total_rooms: parseNumeric(r.total_rooms),
    peak_occupancy_rate: parseNullableNumeric(r.peak_occupancy_rate),
    avg_occupancy_rate: parseNullableNumeric(r.avg_occupancy_rate),
    total_transactions: parseNumeric(r.total_transactions),
    total_count: arr.length,
  }));
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 7: getStayDurationSummary
// ────────────────────────────────────────────────────────────────

export async function getStayDurationSummary(
  startDate?: string,
  endDate?: string,
  location?: string | null,
): Promise<StayDurationSummary[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    duration_category: string;
    transaction_count: number;
    percentage: string;
    total_revenue: string;
  }>(
    `WITH categorized AS (
          SELECT
            CASE
              WHEN t.rental_duration = 3 THEN 'Transit - 3 Jam'
              WHEN t.rental_duration BETWEEN 1 AND 11 AND t.rental_duration <> 3 THEN 'Transit - Lainnya'
              WHEN t.rental_duration BETWEEN 12 AND 23 THEN 'Fullday'
              WHEN t.rental_duration BETWEEN 24 AND 47 THEN 'Per Malam - 1 Malam'
              WHEN t.rental_duration >= 48 THEN 'Per Malam - 2+ Malam'
              ELSE 'Lainnya'
            END AS duration_category,
            t.cash_amount,
            t.transfer_amount
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::TEXT IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
        ),
        aggregated AS (
          SELECT
            c.duration_category,
            COUNT(*) AS tx_count,
            ROUND(SUM(c.cash_amount + c.transfer_amount), 2) AS revenue
          FROM categorized c
          GROUP BY c.duration_category
        ),
        grand_total AS (
          SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
        )
        SELECT
          a.duration_category,
          a.tx_count AS transaction_count,
          ROUND(a.tx_count::numeric / NULLIF(g.total, 0) * 100, 2) AS percentage,
          a.revenue AS total_revenue
        FROM aggregated a, grand_total g
        ORDER BY a.tx_count DESC, a.duration_category`,
    [sd, ed, location ?? null],
  );

  return rows.map((r) => ({
    duration_category: r.duration_category,
    transaction_count: parseNumeric(r.transaction_count),
    percentage: parseNumeric(r.percentage),
    total_revenue: parseNumeric(r.total_revenue),
  }));
}

// ────────────────────────────────────────────────────────────────
// FUNGSI 8: getRepeatGuests
// ────────────────────────────────────────────────────────────────

export async function getRepeatGuests(
  startDate?: string,
  endDate?: string,
  location?: string | null,
  limit: number = 10,
  offset: number = 0,
): Promise<RepeatGuest[]> {
  const { startDate: sd, endDate: ed } = resolveRange(startDate, endDate);
  const rows = await queryAnalytics<{
    customer_name: string;
    visit_count: number;
    total_revenue: string;
    first_visit: string;
    last_visit: string;
    total_count: number;
  }>(
    `WITH normalized AS (
          SELECT
            LOWER(TRIM(t.customer_name)) AS name_key,
            t.customer_name,
            t.checkin_at,
            t.cash_amount,
            t.transfer_amount
          FROM transactions t
          WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN $1 AND $2
            AND ($3::TEXT IS NULL OR t.apartment_location = $3)
            AND (t.is_deleted = FALSE OR t.is_deleted IS NULL)
            AND t.customer_name IS NOT NULL
            AND TRIM(t.customer_name) <> ''
        ),
        aggregated AS (
          SELECT
            n.name_key,
            COUNT(*) AS visit_count,
            ROUND(SUM(n.cash_amount + n.transfer_amount), 2) AS total_revenue,
            MIN(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))::TEXT AS first_visit,
            MAX(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))::TEXT AS last_visit
          FROM normalized n
          GROUP BY n.name_key
          HAVING COUNT(*) >= 2
        ),
        counted AS (
          SELECT COUNT(*) AS cnt FROM aggregated
        )
        SELECT
          MIN(n.customer_name) AS customer_name,
          a.visit_count,
          a.total_revenue,
          a.first_visit,
          a.last_visit,
          c.cnt AS total_count
        FROM aggregated a
        JOIN normalized n ON n.name_key = a.name_key
        CROSS JOIN counted c
        GROUP BY a.name_key, a.visit_count, a.total_revenue, a.first_visit, a.last_visit, c.cnt
        ORDER BY a.visit_count DESC, MIN(n.customer_name)
        LIMIT $4 OFFSET $5`,
    [sd, ed, location ?? null, limit, offset],
  );

  return rows.map((r) => ({
    customer_name: r.customer_name,
    visit_count: parseNumeric(r.visit_count),
    total_revenue: parseNumeric(r.total_revenue),
    first_visit: r.first_visit,
    last_visit: r.last_visit,
    total_count: parseNumeric(r.total_count),
  }));
}
