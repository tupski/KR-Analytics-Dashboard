-- =============================================================
-- MIGRATION: Analytics Dashboard — Schema + Dashboard RPC Functions
-- 1. Tambah kolom total_rooms pada lokasi_apartemen
-- 2. get_occupancy_per_unit    — okupansi per kamar
-- 3. get_profit_per_location   — profit per lokasi
-- 4. get_checkin_heatmap       — distribusi jam check-in (selalu 24 baris)
-- 5. get_guest_source_summary  — sumber tamu / marketing
-- 6. get_repeat_guests         — tamu dengan kunjungan >= 2
-- 7. get_location_fullness     — tingkat kepenuhan per lokasi
-- 8. get_stay_duration_summary — distribusi durasi menginap
-- 9. get_daily_revenue_trend   — tren pendapatan harian
-- =============================================================


-- 1) Tambah kolom total_rooms pada lokasi_apartemen (idempotent)
ALTER TABLE public.lokasi_apartemen
  ADD COLUMN IF NOT EXISTS total_rooms INTEGER DEFAULT 0;


-- =============================================================
-- 2) get_occupancy_per_unit
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_occupancy_per_unit(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  room_number        TEXT,
  apartment_location TEXT,
  total_transactions BIGINT,
  total_revenue      NUMERIC,
  occupancy_rate     NUMERIC,
  total_count        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      t.room_number,
      t.apartment_location,
      t.checkin_at,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  aggregated AS (
    SELECT
      f.room_number,
      f.apartment_location,
      COUNT(*)                                                                AS total_transactions,
      ROUND(SUM(f.cash_amount + f.transfer_amount), 2)                       AS total_revenue,
      ROUND(
        COUNT(DISTINCT DATE(f.checkin_at AT TIME ZONE 'Asia/Jakarta'))::NUMERIC
        / NULLIF((p_end_date - p_start_date + 1), 0) * 100,
        2
      )                                                                       AS occupancy_rate
    FROM filtered f
    GROUP BY f.room_number, f.apartment_location
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.room_number,
    a.apartment_location,
    a.total_transactions,
    a.total_revenue,
    a.occupancy_rate,
    c.cnt AS total_count
  FROM aggregated a, counted c
  ORDER BY a.total_transactions DESC, a.room_number
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_occupancy_per_unit(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_per_unit(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 3) get_profit_per_location
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_profit_per_location(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  apartment_location          TEXT,
  total_revenue               NUMERIC,
  total_transactions          BIGINT,
  avg_revenue_per_transaction NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  SELECT
    t.apartment_location,
    ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                          AS total_revenue,
    COUNT(*)                                                                   AS total_transactions,
    ROUND(
      SUM(t.cash_amount + t.transfer_amount) / NULLIF(COUNT(*), 0),
      2
    )                                                                          AS avg_revenue_per_transaction
  FROM public.transactions t
  WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
    AND (p_location IS NULL OR t.apartment_location = p_location)
  GROUP BY t.apartment_location
  ORDER BY total_revenue DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profit_per_location(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profit_per_location(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 4) get_checkin_heatmap
--    Selalu mengembalikan 24 baris (jam 0–23) via generate_series LEFT JOIN
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_checkin_heatmap(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  hour              INT,
  transaction_count BIGINT,
  percentage        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH hours AS (
    SELECT generate_series(0, 23) AS h
  ),
  checkins AS (
    SELECT
      EXTRACT(HOUR FROM t.checkin_at AT TIME ZONE 'Asia/Jakarta')::INT AS h,
      COUNT(*) AS cnt
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY EXTRACT(HOUR FROM t.checkin_at AT TIME ZONE 'Asia/Jakarta')::INT
  ),
  total AS (
    SELECT COALESCE(SUM(cnt), 0) AS grand_total FROM checkins
  )
  SELECT
    hours.h                                                                    AS hour,
    COALESCE(checkins.cnt, 0)                                                  AS transaction_count,
    ROUND(
      COALESCE(checkins.cnt, 0)::NUMERIC / NULLIF(total.grand_total, 0) * 100,
      2
    )                                                                          AS percentage
  FROM hours
  LEFT JOIN checkins ON checkins.h = hours.h
  CROSS JOIN total
  ORDER BY hours.h;
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkin_heatmap(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_checkin_heatmap(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 5) get_guest_source_summary
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_guest_source_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  source_name       TEXT,
  transaction_count BIGINT,
  total_revenue     NUMERIC,
  percentage        NUMERIC,
  total_count       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)') AS source_name,
      COUNT(*)                                                                    AS transaction_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                           AS total_revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')
  ),
  grand_total AS (
    SELECT COALESCE(SUM(transaction_count), 0) AS total FROM aggregated
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.source_name,
    a.transaction_count,
    a.total_revenue,
    ROUND(
      a.transaction_count::NUMERIC / NULLIF(g.total, 0) * 100,
      2
    )                                                                           AS percentage,
    c.cnt                                                                       AS total_count
  FROM aggregated a, grand_total g, counted c
  ORDER BY a.transaction_count DESC, a.source_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guest_source_summary(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_source_summary(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 6) get_repeat_guests
--    Normalisasi LOWER(TRIM(customer_name)) untuk grouping,
--    kembalikan nama asli (first occurrence by checkin_at)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_repeat_guests(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  customer_name TEXT,
  visit_count   BIGINT,
  total_revenue NUMERIC,
  first_visit   DATE,
  last_visit    DATE,
  total_count   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH normalized AS (
    SELECT
      LOWER(TRIM(t.customer_name))                                             AS name_key,
      t.customer_name                                                          AS original_name,
      t.checkin_at,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
      AND t.customer_name IS NOT NULL
      AND TRIM(t.customer_name) <> ''
  ),
  first_names AS (
    -- Ambil nama asli dari transaksi pertama (checkin_at terlama)
    SELECT DISTINCT ON (name_key)
      name_key,
      original_name
    FROM normalized
    ORDER BY name_key, checkin_at ASC
  ),
  aggregated AS (
    SELECT
      n.name_key,
      COUNT(*)                                                                 AS visit_count,
      ROUND(SUM(n.cash_amount + n.transfer_amount), 2)                        AS total_revenue,
      MIN(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))                     AS first_visit,
      MAX(DATE(n.checkin_at AT TIME ZONE 'Asia/Jakarta'))                     AS last_visit
    FROM normalized n
    GROUP BY n.name_key
    HAVING COUNT(*) >= 2
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    fn.original_name                                                           AS customer_name,
    a.visit_count,
    a.total_revenue,
    a.first_visit,
    a.last_visit,
    c.cnt                                                                      AS total_count
  FROM aggregated a
  JOIN first_names fn ON fn.name_key = a.name_key
  CROSS JOIN counted c
  ORDER BY a.visit_count DESC, fn.original_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_repeat_guests(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_repeat_guests(DATE, DATE, TEXT, INT, INT) TO authenticated;


-- =============================================================
-- 7) get_location_fullness
--    avg_occupancy_rate  = rata-rata harian % kamar terisi
--    peak_occupancy_rate = % hari di mana SEMUA kamar terisi
--    Keduanya NULL jika total_rooms = 0 atau NULL
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_location_fullness(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  apartment_location  TEXT,
  total_rooms         INT,
  peak_occupancy_rate NUMERIC,
  avg_occupancy_rate  NUMERIC,
  total_transactions  BIGINT,
  total_count         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  locations AS (
    SELECT
      la.name                                                                  AS apartment_location,
      COALESCE(la.total_rooms, 0)                                              AS total_rooms
    FROM public.lokasi_apartemen la
    WHERE (p_location IS NULL OR la.name = p_location)
  ),
  daily_occupancy AS (
    -- Hitung jumlah kamar unik yang terisi per hari per lokasi
    SELECT
      t.apartment_location,
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')                          AS checkin_date,
      COUNT(DISTINCT t.room_number)                                            AS rooms_occupied
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location, DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  location_stats AS (
    SELECT
      t.apartment_location,
      COUNT(*)                                                                 AS total_transactions
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  occupancy_stats AS (
    SELECT
      do_data.apartment_location,
      -- avg_occupancy_rate: rata-rata harian (rooms_occupied / total_rooms * 100) per hari yang ada data
      -- dibagi total hari dalam periode
      ROUND(
        SUM(do_data.rooms_occupied::NUMERIC / NULLIF(loc.total_rooms, 0) * 100)
        / NULLIF(pd.total_days, 0),
        2
      )                                                                        AS avg_occupancy_rate,
      -- peak_occupancy_rate: % hari di mana rooms_occupied >= total_rooms
      ROUND(
        COUNT(*) FILTER (WHERE do_data.rooms_occupied >= loc.total_rooms AND loc.total_rooms > 0)::NUMERIC
        / NULLIF(pd.total_days, 0) * 100,
        2
      )                                                                        AS peak_occupancy_rate
    FROM daily_occupancy do_data
    JOIN locations loc ON loc.apartment_location = do_data.apartment_location
    CROSS JOIN period_days pd
    GROUP BY do_data.apartment_location, pd.total_days
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM locations
  )
  SELECT
    loc.apartment_location,
    loc.total_rooms,
    -- NULL jika total_rooms = 0 atau NULL
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0
      THEN NULL
      ELSE os.peak_occupancy_rate
    END                                                                        AS peak_occupancy_rate,
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0
      THEN NULL
      ELSE os.avg_occupancy_rate
    END                                                                        AS avg_occupancy_rate,
    COALESCE(ls.total_transactions, 0)                                         AS total_transactions,
    c.cnt                                                                      AS total_count
  FROM locations loc
  LEFT JOIN occupancy_stats os ON os.apartment_location = loc.apartment_location
  LEFT JOIN location_stats ls ON ls.apartment_location = loc.apartment_location
  CROSS JOIN counted c
  ORDER BY
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0 THEN NULL ELSE os.avg_occupancy_rate END DESC NULLS LAST,
    loc.apartment_location;
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_fullness(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_location_fullness(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 8) get_stay_duration_summary
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_stay_duration_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  duration_category TEXT,
  transaction_count BIGINT,
  percentage        NUMERIC,
  total_revenue     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH categorized AS (
    SELECT
      CASE
        WHEN t.rental_duration = 3                                    THEN 'Transit - 3 Jam'
        WHEN t.rental_duration BETWEEN 1 AND 11
             AND t.rental_duration <> 3                               THEN 'Transit - Lainnya'
        WHEN t.rental_duration BETWEEN 12 AND 23                      THEN 'Fullday'
        WHEN t.rental_duration BETWEEN 24 AND 47                      THEN 'Per Malam - 1 Malam'
        WHEN t.rental_duration >= 48                                  THEN 'Per Malam - 2+ Malam'
        ELSE                                                               'Lainnya'
      END                                                                      AS duration_category,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  aggregated AS (
    SELECT
      c.duration_category,
      COUNT(*)                                                                 AS transaction_count,
      ROUND(SUM(c.cash_amount + c.transfer_amount), 2)                        AS total_revenue
    FROM categorized c
    GROUP BY c.duration_category
  ),
  grand_total AS (
    SELECT COALESCE(SUM(transaction_count), 0) AS total FROM aggregated
  )
  SELECT
    a.duration_category,
    a.transaction_count,
    ROUND(
      a.transaction_count::NUMERIC / NULLIF(g.total, 0) * 100,
      2
    )                                                                          AS percentage,
    a.total_revenue
  FROM aggregated a, grand_total g
  ORDER BY a.transaction_count DESC, a.duration_category;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stay_duration_summary(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stay_duration_summary(DATE, DATE, TEXT) TO authenticated;


-- =============================================================
-- 9) get_daily_revenue_trend
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_daily_revenue_trend(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 10,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  transaction_date            DATE,
  total_revenue               NUMERIC,
  transaction_count           BIGINT,
  avg_revenue_per_transaction NUMERIC,
  total_count                 BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')                          AS transaction_date,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue,
      COUNT(*)                                                                 AS transaction_count
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.transaction_date,
    a.total_revenue,
    a.transaction_count,
    ROUND(
      a.total_revenue / NULLIF(a.transaction_count, 0),
      2
    )                                                                          AS avg_revenue_per_transaction,
    c.cnt                                                                      AS total_count
  FROM aggregated a, counted c
  ORDER BY a.transaction_date DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_revenue_trend(DATE, DATE, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue_trend(DATE, DATE, TEXT, INT, INT) TO authenticated;
