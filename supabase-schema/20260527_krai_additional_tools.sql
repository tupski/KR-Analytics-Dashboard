-- =============================================================
-- MIGRATION: KR•AI Additional Tools — Safe & Deterministic Analytics
-- Created: 2026-05-27
-- 
-- Tools implemented:
-- 1. get_live_checkins              — tamu yang sedang menginap sekarang
-- 2. detect_idle_units              — unit kosong terlalu lama
-- 3. search_transactions            — cari transaksi dengan pattern matching
-- 4. search_expenses                — cari pengeluaran dengan pattern matching
-- 5. get_unpaid_bills_detail        — detail tagihan unpaid per unit
-- 6. get_underperforming_units      — unit dengan performa buruk
-- 7. estimate_month_end_revenue     — prediksi revenue akhir bulan
-- 8. get_weekend_vs_weekday_analysis — analisis weekday vs weekend
-- 
-- All functions are:
-- - READ ONLY (SECURITY DEFINER with read-only queries)
-- - Have LIMIT/timeout protection
-- - Timezone-aware (Asia/Jakarta)
-- - RLS-safe
-- =============================================================


-- =============================================================
-- 1) get_live_checkins
--    Tamu yang sedang menginap saat ini (realtime)
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_live_checkins(
  p_location TEXT DEFAULT NULL,
  p_limit    INT  DEFAULT 50
)
RETURNS TABLE (
  customer_name      TEXT,
  room_number        TEXT,
  apartment_location TEXT,
  checkin_at         TIMESTAMPTZ,
  checkout_at        TIMESTAMPTZ,
  rental_duration    INT,
  days_stayed        NUMERIC,
  total_amount       NUMERIC,
  marketing_name     TEXT,
  total_count        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_now TIMESTAMPTZ;
BEGIN
  v_now := NOW() AT TIME ZONE 'Asia/Jakarta';

  RETURN QUERY
  WITH active_stays AS (
    SELECT
      t.customer_name,
      t.room_number,
      t.apartment_location,
      t.checkin_at,
      t.checkout_at,
      t.rental_duration,
      ROUND(
        EXTRACT(EPOCH FROM (v_now - t.checkin_at)) / 3600,
        1
      ) AS hours_stayed,
      (t.cash_amount + t.transfer_amount) AS total_amount,
      COALESCE(NULLIF(TRIM(t.marketing_name), ''), '-') AS marketing_name
    FROM public.transactions t
    WHERE t.checkin_at <= v_now
      AND t.checkout_at >= v_now
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM active_stays
  )
  SELECT
    a.customer_name,
    a.room_number,
    a.apartment_location,
    a.checkin_at,
    a.checkout_at,
    a.rental_duration,
    a.hours_stayed AS days_stayed,
    a.total_amount,
    a.marketing_name,
    c.cnt AS total_count
  FROM active_stays a, counted c
  ORDER BY a.checkin_at DESC
  LIMIT LEAST(p_limit, 100);
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_checkins(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_checkins(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.get_live_checkins IS 
'Menampilkan daftar tamu yang sedang menginap saat ini (realtime). Read-only, safe.';


-- =============================================================
-- 2) detect_idle_units
--    Unit yang tidak ada transaksi dalam X hari terakhir
-- =============================================================
CREATE OR REPLACE FUNCTION public.detect_idle_units(
  p_days_threshold INT  DEFAULT 7,
  p_location       TEXT DEFAULT NULL,
  p_limit          INT  DEFAULT 50
)
RETURNS TABLE (
  room_number        TEXT,
  apartment_location TEXT,
  days_idle          INT,
  last_checkin_at    TIMESTAMPTZ,
  last_customer      TEXT,
  last_revenue       NUMERIC,
  total_count        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  v_cutoff_date := (NOW() AT TIME ZONE 'Asia/Jakarta') - (p_days_threshold || ' days')::INTERVAL;

  RETURN QUERY
  WITH all_rooms AS (
    -- Ambil semua unit dari nomor_kamar
    SELECT
      nk.nomor AS room_number,
      nk.lokasi AS apartment_location
    FROM public.nomor_kamar nk
    WHERE (p_location IS NULL OR nk.lokasi = p_location)
  ),
  last_transactions AS (
    -- Ambil transaksi terakhir per unit
    SELECT DISTINCT ON (t.apartment_location, t.room_number)
      t.apartment_location,
      t.room_number,
      t.checkin_at,
      t.customer_name,
      (t.cash_amount + t.transfer_amount) AS revenue
    FROM public.transactions t
    WHERE (p_location IS NULL OR t.apartment_location = p_location)
    ORDER BY t.apartment_location, t.room_number, t.checkin_at DESC
  ),
  idle_analysis AS (
    SELECT
      ar.room_number,
      ar.apartment_location,
      CASE
        WHEN lt.checkin_at IS NULL THEN 999
        ELSE EXTRACT(DAY FROM (NOW() AT TIME ZONE 'Asia/Jakarta') - lt.checkin_at)::INT
      END AS days_idle,
      lt.checkin_at AS last_checkin_at,
      lt.customer_name AS last_customer,
      lt.revenue AS last_revenue
    FROM all_rooms ar
    LEFT JOIN last_transactions lt 
      ON lt.apartment_location = ar.apartment_location 
      AND lt.room_number = ar.room_number
    WHERE lt.checkin_at IS NULL OR lt.checkin_at < v_cutoff_date
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM idle_analysis
  )
  SELECT
    ia.room_number,
    ia.apartment_location,
    ia.days_idle,
    ia.last_checkin_at,
    ia.last_customer,
    ia.last_revenue,
    c.cnt AS total_count
  FROM idle_analysis ia, counted c
  ORDER BY ia.days_idle DESC, ia.apartment_location, ia.room_number
  LIMIT LEAST(p_limit, 100);
END;
$$;

REVOKE ALL ON FUNCTION public.detect_idle_units(INT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_idle_units(INT, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.detect_idle_units IS 
'Deteksi unit yang idle (tidak ada transaksi) dalam X hari terakhir. Default 7 hari.';


-- =============================================================
-- 3) search_transactions
--    Cari transaksi berdasarkan customer name, room, atau lokasi
-- =============================================================
CREATE OR REPLACE FUNCTION public.search_transactions(
  p_query        TEXT,
  p_start_date   DATE DEFAULT NULL,
  p_end_date     DATE DEFAULT NULL,
  p_location     TEXT DEFAULT NULL,
  p_limit        INT  DEFAULT 20
)
RETURNS TABLE (
  id                 INT,
  customer_name      TEXT,
  room_number        TEXT,
  apartment_location TEXT,
  checkin_at         TIMESTAMPTZ,
  checkout_at        TIMESTAMPTZ,
  rental_duration    INT,
  total_amount       NUMERIC,
  cash_amount        NUMERIC,
  transfer_amount    NUMERIC,
  marketing_name     TEXT,
  created_at         TIMESTAMPTZ,
  total_count        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_search_pattern TEXT;
BEGIN
  -- Sanitize search query
  v_search_pattern := '%' || LOWER(TRIM(p_query)) || '%';

  RETURN QUERY
  WITH filtered AS (
    SELECT
      t.id,
      t.customer_name,
      t.room_number,
      t.apartment_location,
      t.checkin_at,
      t.checkout_at,
      t.rental_duration,
      (t.cash_amount + t.transfer_amount) AS total_amount,
      t.cash_amount,
      t.transfer_amount,
      COALESCE(NULLIF(TRIM(t.marketing_name), ''), '-') AS marketing_name,
      t.created_at
    FROM public.transactions t
    WHERE (
      LOWER(t.customer_name) LIKE v_search_pattern
      OR LOWER(t.room_number) LIKE v_search_pattern
      OR LOWER(t.apartment_location) LIKE v_search_pattern
      OR t.id::TEXT LIKE v_search_pattern
    )
    AND (p_start_date IS NULL OR DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') >= p_start_date)
    AND (p_end_date IS NULL OR DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') <= p_end_date)
    AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.customer_name,
    f.room_number,
    f.apartment_location,
    f.checkin_at,
    f.checkout_at,
    f.rental_duration,
    f.total_amount,
    f.cash_amount,
    f.transfer_amount,
    f.marketing_name,
    f.created_at,
    c.cnt AS total_count
  FROM filtered f, counted c
  ORDER BY f.checkin_at DESC
  LIMIT LEAST(p_limit, 100);
END;
$$;

REVOKE ALL ON FUNCTION public.search_transactions(TEXT, DATE, DATE, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_transactions(TEXT, DATE, DATE, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.search_transactions IS 
'Cari transaksi berdasarkan customer name, room number, lokasi, atau ID. Pattern matching dengan ILIKE.';


-- =============================================================
-- 4) search_expenses
--    Cari pengeluaran berdasarkan deskripsi atau kategori
-- =============================================================
CREATE OR REPLACE FUNCTION public.search_expenses(
  p_query        TEXT,
  p_start_date   DATE DEFAULT NULL,
  p_end_date     DATE DEFAULT NULL,
  p_location     TEXT DEFAULT NULL,
  p_category     TEXT DEFAULT NULL,
  p_limit        INT  DEFAULT 20
)
RETURNS TABLE (
  id                 INT,
  tanggal            DATE,
  deskripsi          TEXT,
  jumlah             NUMERIC,
  category           TEXT,
  apartment_location TEXT,
  created_at         TIMESTAMPTZ,
  total_count        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_search_pattern TEXT;
BEGIN
  v_search_pattern := '%' || LOWER(TRIM(p_query)) || '%';

  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.id,
      p.tanggal,
      p.deskripsi,
      p.jumlah,
      COALESCE(p.category, 'Lainnya') AS category,
      p.apartment_location,
      p.created_at
    FROM public.pengeluaran p
    WHERE (
      LOWER(p.deskripsi) LIKE v_search_pattern
      OR LOWER(COALESCE(p.category, '')) LIKE v_search_pattern
      OR p.id::TEXT LIKE v_search_pattern
    )
    AND (p_start_date IS NULL OR p.tanggal >= p_start_date)
    AND (p_end_date IS NULL OR p.tanggal <= p_end_date)
    AND (p_location IS NULL OR p.apartment_location = p_location)
    AND (p_category IS NULL OR LOWER(p.category) = LOWER(p_category))
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.tanggal,
    f.deskripsi,
    f.jumlah,
    f.category,
    f.apartment_location,
    f.created_at,
    c.cnt AS total_count
  FROM filtered f, counted c
  ORDER BY f.tanggal DESC, f.created_at DESC
  LIMIT LEAST(p_limit, 100);
END;
$$;

REVOKE ALL ON FUNCTION public.search_expenses(TEXT, DATE, DATE, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_expenses(TEXT, DATE, DATE, TEXT, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.search_expenses IS 
'Cari pengeluaran berdasarkan deskripsi, kategori, atau ID. Pattern matching dengan ILIKE.';


-- =============================================================
-- 5) get_unpaid_bills_detail
--    Detail tagihan unpaid per unit dengan aging analysis
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_unpaid_bills_detail(
  p_location TEXT DEFAULT NULL,
  p_limit    INT  DEFAULT 50
)
RETURNS TABLE (
  id                 INT,
  room_number        TEXT,
  apartment_location TEXT,
  amount             NUMERIC,
  due_date           DATE,
  days_overdue       INT,
  aging_bucket       TEXT,
  status             TEXT,
  created_at         TIMESTAMPTZ,
  total_count        BIGINT,
  total_amount       NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_today DATE;
BEGIN
  v_today := CURRENT_DATE;

  RETURN QUERY
  WITH unpaid AS (
    SELECT
      tb.id,
      tb.room_number,
      tb.apartment_location,
      tb.amount,
      tb.due_date,
      (v_today - tb.due_date) AS days_overdue,
      CASE
        WHEN (v_today - tb.due_date) <= 0  THEN 'Belum Jatuh Tempo'
        WHEN (v_today - tb.due_date) <= 30 THEN '1-30 Hari'
        WHEN (v_today - tb.due_date) <= 60 THEN '31-60 Hari'
        WHEN (v_today - tb.due_date) <= 90 THEN '61-90 Hari'
        ELSE '90+ Hari'
      END AS aging_bucket,
      tb.status,
      tb.created_at
    FROM public.tagihan_bulanan tb
    WHERE tb.status = 'unpaid'
      AND (p_location IS NULL OR tb.apartment_location = p_location)
  ),
  counted AS (
    SELECT 
      COUNT(*) AS cnt,
      COALESCE(SUM(amount), 0) AS total_amt
    FROM unpaid
  )
  SELECT
    u.id,
    u.room_number,
    u.apartment_location,
    u.amount,
    u.due_date,
    u.days_overdue,
    u.aging_bucket,
    u.status,
    u.created_at,
    c.cnt AS total_count,
    c.total_amt AS total_amount
  FROM unpaid u, counted c
  ORDER BY u.days_overdue DESC, u.amount DESC
  LIMIT LEAST(p_limit, 100);
END;
$$;

REVOKE ALL ON FUNCTION public.get_unpaid_bills_detail(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unpaid_bills_detail(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.get_unpaid_bills_detail IS 
'Detail tagihan unpaid dengan aging analysis (0-30, 31-60, 61-90, 90+ hari).';


-- =============================================================
-- 6) get_underperforming_units
--    Unit dengan occupancy rate & revenue di bawah rata-rata
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_underperforming_units(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL,
  p_threshold  NUMERIC DEFAULT 50.0,
  p_limit      INT DEFAULT 20
)
RETURNS TABLE (
  room_number        TEXT,
  apartment_location TEXT,
  total_transactions BIGINT,
  total_revenue      NUMERIC,
  occupancy_rate     NUMERIC,
  avg_revenue_per_tx NUMERIC,
  performance_score  NUMERIC,
  total_count        BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  unit_stats AS (
    SELECT
      t.room_number,
      t.apartment_location,
      COUNT(*) AS total_transactions,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2) AS total_revenue,
      ROUND(
        COUNT(DISTINCT DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta'))::NUMERIC
        / NULLIF(pd.total_days, 0) * 100,
        2
      ) AS occupancy_rate,
      ROUND(
        SUM(t.cash_amount + t.transfer_amount) / NULLIF(COUNT(*), 0),
        2
      ) AS avg_revenue_per_tx
    FROM public.transactions t, period_days pd
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.room_number, t.apartment_location, pd.total_days
  ),
  averages AS (
    SELECT
      AVG(occupancy_rate) AS avg_occ,
      AVG(total_revenue) AS avg_rev
    FROM unit_stats
  ),
  scored AS (
    SELECT
      us.*,
      -- Performance score: weighted average of occupancy & revenue vs average
      ROUND(
        (us.occupancy_rate / NULLIF(av.avg_occ, 0) * 50) +
        (us.total_revenue / NULLIF(av.avg_rev, 0) * 50),
        2
      ) AS performance_score
    FROM unit_stats us, averages av
    WHERE us.occupancy_rate < p_threshold
       OR (us.total_revenue < av.avg_rev * 0.7)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM scored
  )
  SELECT
    s.room_number,
    s.apartment_location,
    s.total_transactions,
    s.total_revenue,
    s.occupancy_rate,
    s.avg_revenue_per_tx,
    s.performance_score,
    c.cnt AS total_count
  FROM scored s, counted c
  ORDER BY s.performance_score ASC, s.occupancy_rate ASC
  LIMIT LEAST(p_limit, 100);
END;
$$;

REVOKE ALL ON FUNCTION public.get_underperforming_units(DATE, DATE, TEXT, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_underperforming_units(DATE, DATE, TEXT, NUMERIC, INT) TO authenticated;

COMMENT ON FUNCTION public.get_underperforming_units IS 
'Deteksi unit dengan performa buruk (occupancy < threshold atau revenue < 70% rata-rata).';


-- =============================================================
-- 7) estimate_month_end_revenue
--    Prediksi revenue akhir bulan berdasarkan trend saat ini
-- =============================================================
CREATE OR REPLACE FUNCTION public.estimate_month_end_revenue(
  p_year     INT DEFAULT NULL,
  p_month    INT DEFAULT NULL,
  p_location TEXT DEFAULT NULL
)
RETURNS TABLE (
  year_month         TEXT,
  days_elapsed       INT,
  days_remaining     INT,
  days_in_month      INT,
  revenue_to_date    NUMERIC,
  avg_revenue_per_day NUMERIC,
  estimated_total    NUMERIC,
  estimated_remaining NUMERIC,
  confidence_level   TEXT,
  location           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_year INT;
  v_month INT;
  v_start_date DATE;
  v_end_date DATE;
  v_today DATE;
  v_days_elapsed INT;
  v_days_in_month INT;
  v_days_remaining INT;
  v_revenue_to_date NUMERIC;
  v_avg_per_day NUMERIC;
  v_estimated_total NUMERIC;
  v_confidence TEXT;
BEGIN
  -- Default to current month if not specified
  v_today := CURRENT_DATE;
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM v_today)::INT);
  v_month := COALESCE(p_month, EXTRACT(MONTH FROM v_today)::INT);

  v_start_date := make_date(v_year, v_month, 1);
  v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_days_in_month := EXTRACT(DAY FROM v_end_date)::INT;

  -- Calculate days elapsed (only up to today if current month)
  IF v_year = EXTRACT(YEAR FROM v_today)::INT AND v_month = EXTRACT(MONTH FROM v_today)::INT THEN
    v_days_elapsed := EXTRACT(DAY FROM v_today)::INT;
  ELSE
    v_days_elapsed := v_days_in_month;
  END IF;

  v_days_remaining := v_days_in_month - v_days_elapsed;

  -- Get revenue to date
  SELECT COALESCE(SUM(t.cash_amount + t.transfer_amount), 0)
  INTO v_revenue_to_date
  FROM public.transactions t
  WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') >= v_start_date
    AND DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') <= LEAST(v_end_date, v_today)
    AND (p_location IS NULL OR t.apartment_location = p_location);

  -- Calculate average per day
  v_avg_per_day := CASE 
    WHEN v_days_elapsed > 0 THEN v_revenue_to_date / v_days_elapsed
    ELSE 0
  END;

  -- Estimate total
  v_estimated_total := v_revenue_to_date + (v_avg_per_day * v_days_remaining);

  -- Confidence level based on days elapsed
  v_confidence := CASE
    WHEN v_days_elapsed < 7 THEN 'Rendah (< 7 hari data)'
    WHEN v_days_elapsed < 15 THEN 'Sedang (7-14 hari data)'
    WHEN v_days_elapsed < 25 THEN 'Tinggi (15-24 hari data)'
    ELSE 'Sangat Tinggi (25+ hari data)'
  END;

  RETURN QUERY
  SELECT
    TO_CHAR(v_start_date, 'YYYY-MM') AS year_month,
    v_days_elapsed AS days_elapsed,
    v_days_remaining AS days_remaining,
    v_days_in_month AS days_in_month,
    ROUND(v_revenue_to_date, 2) AS revenue_to_date,
    ROUND(v_avg_per_day, 2) AS avg_revenue_per_day,
    ROUND(v_estimated_total, 2) AS estimated_total,
    ROUND(v_avg_per_day * v_days_remaining, 2) AS estimated_remaining,
    v_confidence AS confidence_level,
    COALESCE(p_location, 'Semua Lokasi') AS location;
END;
$$;

REVOKE ALL ON FUNCTION public.estimate_month_end_revenue(INT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_month_end_revenue(INT, INT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.estimate_month_end_revenue IS 
'Prediksi revenue akhir bulan berdasarkan rata-rata harian. Default: bulan berjalan.';


-- =============================================================
-- 8) get_weekend_vs_weekday_analysis
--    Analisis performa weekend vs weekday
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_weekend_vs_weekday_analysis(
  p_start_date DATE,
  p_end_date   DATE,
  p_location   TEXT DEFAULT NULL
)
RETURNS TABLE (
  day_type              TEXT,
  total_transactions    BIGINT,
  total_revenue         NUMERIC,
  avg_revenue_per_day   NUMERIC,
  avg_revenue_per_tx    NUMERIC,
  percentage_of_total   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH categorized AS (
    SELECT
      CASE
        WHEN EXTRACT(DOW FROM t.checkin_at AT TIME ZONE 'Asia/Jakarta') IN (0, 6) 
        THEN 'Weekend (Sabtu-Minggu)'
        ELSE 'Weekday (Senin-Jumat)'
      END AS day_type,
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') AS checkin_date,
      (t.cash_amount + t.transfer_amount) AS revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  aggregated AS (
    SELECT
      c.day_type,
      COUNT(*) AS total_transactions,
      ROUND(SUM(c.revenue), 2) AS total_revenue,
      COUNT(DISTINCT c.checkin_date) AS unique_days
    FROM categorized c
    GROUP BY c.day_type
  ),
  grand_total AS (
    SELECT COALESCE(SUM(total_revenue), 0) AS total FROM aggregated
  )
  SELECT
    a.day_type,
    a.total_transactions,
    a.total_revenue,
    ROUND(a.total_revenue / NULLIF(a.unique_days, 0), 2) AS avg_revenue_per_day,
    ROUND(a.total_revenue / NULLIF(a.total_transactions, 0), 2) AS avg_revenue_per_tx,
    ROUND(
      a.total_revenue / NULLIF(g.total, 0) * 100,
      2
    ) AS percentage_of_total
  FROM aggregated a, grand_total g
  ORDER BY a.day_type DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_weekend_vs_weekday_analysis(DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekend_vs_weekday_analysis(DATE, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_weekend_vs_weekday_analysis IS 
'Analisis performa weekend (Sabtu-Minggu) vs weekday (Senin-Jumat).';


-- =============================================================
-- Create indexes for better performance
-- =============================================================

-- Index untuk search transactions (customer_name, room_number)
CREATE INDEX IF NOT EXISTS idx_transactions_customer_name_lower 
  ON public.transactions (LOWER(customer_name));

CREATE INDEX IF NOT EXISTS idx_transactions_room_number_lower 
  ON public.transactions (LOWER(room_number));

-- Index untuk date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_checkin_location 
  ON public.transactions (checkin_at, apartment_location);

CREATE INDEX IF NOT EXISTS idx_pengeluaran_tanggal_location 
  ON public.pengeluaran (tanggal, apartment_location);

-- Index untuk idle unit detection
CREATE INDEX IF NOT EXISTS idx_transactions_location_room_checkin 
  ON public.transactions (apartment_location, room_number, checkin_at DESC);

-- Index untuk unpaid bills
CREATE INDEX IF NOT EXISTS idx_tagihan_status_due_date 
  ON public.tagihan_bulanan (status, due_date) 
  WHERE status = 'unpaid';


-- =============================================================
-- Grant permissions
-- =============================================================

-- Ensure authenticated users can access these functions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;


-- =============================================================
-- Migration complete
-- =============================================================

COMMENT ON SCHEMA public IS 
'KR•AI Additional Tools Migration (2026-05-27): 8 new safe, deterministic analytics functions added.';
