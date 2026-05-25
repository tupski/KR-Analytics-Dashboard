


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."admin_create_user"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Cek apakah pemanggil adalah super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat menambah user.';
  END IF;

  -- 1) Create auth user
  -- Catatan: Password di-hash menggunakan pgcrypto (pastikan extension terinstall)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
    is_super_admin, created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', p_full_name),
    false,
    now(),
    now()
  )
  RETURNING id INTO v_user_id;

  -- 2) Role (Tabel user_roles)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- 3) Profile (Tabel user_profiles)
  INSERT INTO public.user_profiles (id, email, full_name, phone, gender, role)
  VALUES (v_user_id, p_email, p_full_name, p_phone, p_gender, p_role)
  ON CONFLICT (id) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    gender = EXCLUDED.gender,
    role = EXCLUDED.role;

  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."admin_create_user"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  -- Cek apakah pemanggil adalah super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat menghapus user.';
  END IF;

  -- Jangan hapus diri sendiri
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak dapat menghapus akun Anda sendiri.';
  END IF;

  -- Hapus dari auth.users (Cascade akan menghapus profile & roles jika foreign key diset cascade)
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_user"("p_target_user_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat mengubah user.';
  END IF;

  UPDATE public.user_profiles
  SET
    full_name = p_full_name,
    phone = p_phone,
    gender = p_gender,
    role = p_role,
    updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, p_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."admin_update_user"("p_target_user_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_account_karyawan_admin"("p_full_name" "text", "p_phone" "text", "p_email" "text", "p_password" "text", "p_role" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_role text := lower(trim(p_role));
  v_now timestamptz := now();
BEGIN
  IF v_role NOT IN ('karyawan', 'admin') THEN
    RAISE EXCEPTION 'Role harus karyawan atau admin.';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'Email wajib diisi.';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password minimal 6 karakter.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'Email sudah terdaftar.';
  END IF;

  -- 1) Buat user di auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    v_now,
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('full_name', p_full_name, 'phone', p_phone, 'role', v_role),
    v_now,
    v_now
  );

  -- 1b) Buat identity email agar kompatibel dengan GoTrue (wajib di beberapa versi Supabase)
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email))),
    'email',
    v_now,
    v_now,
    v_now
  );

  -- 2) Simpan role aplikasi
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- 3) Simpan profile user
  INSERT INTO public.user_profiles (id, email, full_name, phone, role)
  VALUES (v_user_id, lower(trim(p_email)), p_full_name, p_phone, v_role)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    updated_at = now();

  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."create_account_karyawan_admin"("p_full_name" "text", "p_phone" "text", "p_email" "text", "p_password" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_transaction_cascade"("p_transaction_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_user_role TEXT;
    v_removed_fee_rows INTEGER := 0;
    v_updated_fee_rows INTEGER := 0;
BEGIN
    SELECT *
    INTO v_tx
    FROM public.transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi tidak ditemukan.';
    END IF;

    SELECT ur.role
    INTO v_user_role
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    LIMIT 1;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesi tidak valid.';
    END IF;

    IF auth.uid() <> v_tx.user_id AND COALESCE(v_user_role, 'karyawan') NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Akses ditolak untuk menghapus transaksi ini.';
    END IF;

    -- Sinkronisasi riwayat komisi marketing (tagihan_fee_lunas) berdasarkan ID transaksi (lebih akurat) atau detail customer+lokasi
    UPDATE public.tagihan_fee_lunas tfl
    SET
        transactions_detail = COALESCE(
            (
                SELECT jsonb_agg(elem)
                FROM jsonb_array_elements(COALESCE(tfl.transactions_detail, '[]'::jsonb)) elem
                WHERE NOT (
                    (elem ? 'transaction_id' AND (elem->>'transaction_id')::bigint = p_transaction_id)
                    OR 
                    (
                        NOT (elem ? 'transaction_id') AND
                        COALESCE(elem->>'customer', '') = COALESCE(v_tx.customer_name, '') AND
                        COALESCE(elem->>'location', '') = COALESCE(v_tx.apartment_location, '')
                    )
                )
            ),
            '[]'::jsonb
        ),
        customer_count = GREATEST(COALESCE(tfl.customer_count, 0) - 1, 0),
        total_fee = GREATEST(COALESCE(tfl.total_fee, 0) - COALESCE(v_tx.marketing_fee, 0), 0)
    WHERE tfl.marketing_name = v_tx.marketing_name
      AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(tfl.transactions_detail, '[]'::jsonb)) elem
          WHERE (elem ? 'transaction_id' AND (elem->>'transaction_id')::bigint = p_transaction_id)
             OR (COALESCE(elem->>'customer', '') = COALESCE(v_tx.customer_name, '')
                 AND COALESCE(elem->>'location', '') = COALESCE(v_tx.apartment_location, '')
             )
      );

    GET DIAGNOSTICS v_updated_fee_rows = ROW_COUNT;

    DELETE FROM public.tagihan_fee_lunas
    WHERE customer_count <= 0
       OR COALESCE(transactions_detail, '[]'::jsonb) = '[]'::jsonb;

    GET DIAGNOSTICS v_removed_fee_rows = ROW_COUNT;

    -- Hapus transaksi utama
    DELETE FROM public.transactions
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'deleted_transaction_id', p_transaction_id,
        'updated_fee_rows', v_updated_fee_rows,
        'removed_fee_rows', v_removed_fee_rows
    );
END;
$$;


ALTER FUNCTION "public"."delete_transaction_cascade"("p_transaction_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_category_summary"("p_lokasi" "text" DEFAULT NULL::"text", "p_kamar" "text" DEFAULT NULL::"text", "p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("category" "text", "raw_category" "text", "total_amount" numeric, "transaction_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya') AS category,
    p.category AS raw_category,
    SUM(p.jumlah) AS total_amount,
    COUNT(*) AS transaction_count
  FROM pengeluaran p
  WHERE
    (p_lokasi IS NULL OR p.apartment_location = p_lokasi)
    AND (p_kamar IS NULL OR p.room_number = p_kamar)
    AND (p_start_date IS NULL OR p.tanggal >= p_start_date)
    AND (p_end_date IS NULL OR p.tanggal <= p_end_date)
  GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya'), p.category
  ORDER BY total_amount DESC;
$$;


ALTER FUNCTION "public"."get_category_summary"("p_lokasi" "text", "p_kamar" "text", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_checkin_heatmap"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("hour" integer, "transaction_count" bigint, "percentage" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_checkin_heatmap"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("transaction_date" "date", "total_revenue" numeric, "transaction_count" bigint, "avg_revenue_per_transaction" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_daily_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_kpis"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("total_revenue" numeric, "total_expense" numeric, "net_profit" numeric, "total_transactions" bigint, "unique_customers" bigint, "avg_occupancy_rate" numeric, "prev_total_revenue" numeric, "prev_total_expense" numeric, "prev_net_profit" numeric, "prev_total_transactions" bigint, "prev_unique_customers" bigint, "revenue_change_pct" numeric, "expense_change_pct" numeric, "net_profit_change_pct" numeric, "transactions_change_pct" numeric, "customers_change_pct" numeric, "current_period_label" "text", "previous_period_label" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_period_days INT  := (p_end_date - p_start_date + 1);
  v_prev_start  DATE := (p_start_date - v_period_days);
  v_prev_end    DATE := (p_start_date - 1);
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH
  cur_tx AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                  AS tx_count,
      COUNT(DISTINCT LOWER(TRIM(t.customer_name))) FILTER (
        WHERE t.customer_name IS NOT NULL AND TRIM(t.customer_name) <> ''
      )                                                                         AS uniq_cust
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  prev_tx AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                  AS tx_count,
      COUNT(DISTINCT LOWER(TRIM(t.customer_name))) FILTER (
        WHERE t.customer_name IS NOT NULL AND TRIM(t.customer_name) <> ''
      )                                                                         AS uniq_cust
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN v_prev_start AND v_prev_end
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  cur_exp AS (
    SELECT ROUND(SUM(p.jumlah), 2) AS expense
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR p.apartment_location = p_location)
  ),
  prev_exp AS (
    SELECT ROUND(SUM(p.jumlah), 2) AS expense
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN v_prev_start AND v_prev_end
      AND (p_location IS NULL OR p.apartment_location = p_location)
  ),
  -- Avg occupancy: total kamar dari nomor_kamar (filter lokasi),
  -- dipakai sebagai pembagi untuk seluruh hari periode.
  rooms_count AS (
    SELECT COALESCE(SUM(rc), 0) AS total_rooms
    FROM (
      SELECT COUNT(*) AS rc
      FROM public.nomor_kamar nk
      WHERE (p_location IS NULL OR nk.lokasi = p_location)
    ) sub
  ),
  daily_occupancy AS (
    SELECT
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') AS d,
      COUNT(DISTINCT (t.apartment_location || '|' || t.room_number)) AS rooms_used
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  occ AS (
    SELECT
      ROUND(
        SUM(do_d.rooms_used::NUMERIC / NULLIF(rc.total_rooms, 0) * 100)
        / NULLIF(v_period_days, 0),
        2
      ) AS avg_occ
    FROM daily_occupancy do_d
    CROSS JOIN rooms_count rc
  )
  SELECT
    COALESCE(ct.revenue, 0)                                                    AS total_revenue,
    COALESCE(ce.expense, 0)                                                    AS total_expense,
    ROUND(COALESCE(ct.revenue, 0) - COALESCE(ce.expense, 0), 2)               AS net_profit,
    COALESCE(ct.tx_count, 0)                                                   AS total_transactions,
    COALESCE(ct.uniq_cust, 0)                                                  AS unique_customers,
    COALESCE(o.avg_occ, 0)                                                     AS avg_occupancy_rate,
    COALESCE(pt.revenue, 0)                                                    AS prev_total_revenue,
    COALESCE(pe.expense, 0)                                                    AS prev_total_expense,
    ROUND(COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0), 2)               AS prev_net_profit,
    COALESCE(pt.tx_count, 0)                                                   AS prev_total_transactions,
    COALESCE(pt.uniq_cust, 0)                                                  AS prev_unique_customers,
    ROUND(
      (COALESCE(ct.revenue, 0) - COALESCE(pt.revenue, 0))
        / NULLIF(pt.revenue, 0) * 100,
      2
    )                                                                          AS revenue_change_pct,
    ROUND(
      (COALESCE(ce.expense, 0) - COALESCE(pe.expense, 0))
        / NULLIF(pe.expense, 0) * 100,
      2
    )                                                                          AS expense_change_pct,
    ROUND(
      (
        (COALESCE(ct.revenue, 0) - COALESCE(ce.expense, 0))
        - (COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0))
      )
      / NULLIF(COALESCE(pt.revenue, 0) - COALESCE(pe.expense, 0), 0) * 100,
      2
    )                                                                          AS net_profit_change_pct,
    ROUND(
      (COALESCE(ct.tx_count, 0) - COALESCE(pt.tx_count, 0))::NUMERIC
        / NULLIF(pt.tx_count, 0) * 100,
      2
    )                                                                          AS transactions_change_pct,
    ROUND(
      (COALESCE(ct.uniq_cust, 0) - COALESCE(pt.uniq_cust, 0))::NUMERIC
        / NULLIF(pt.uniq_cust, 0) * 100,
      2
    )                                                                          AS customers_change_pct,
    (TO_CHAR(p_start_date, 'DD Mon YYYY') || ' – ' || TO_CHAR(p_end_date, 'DD Mon YYYY'))::TEXT
                                                                                AS current_period_label,
    (TO_CHAR(v_prev_start, 'DD Mon YYYY') || ' – ' || TO_CHAR(v_prev_end, 'DD Mon YYYY'))::TEXT
                                                                                AS previous_period_label
  FROM cur_tx ct, prev_tx pt, cur_exp ce, prev_exp pe, occ o;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_kpis"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_expense_breakdown_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("category" "text", "total_expense" numeric, "expense_count" bigint, "percentage" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      COALESCE(NULLIF(TRIM(p.category), ''), 'Lain-lain')::TEXT                AS category,
      ROUND(SUM(p.jumlah), 2)                                                  AS total_expense,
      COUNT(*)                                                                 AS expense_count
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR p.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Lain-lain')
  ),
  grand_total AS (
    SELECT COALESCE(SUM(a.total_expense), 0) AS total FROM aggregated a
  )
  SELECT
    a.category,
    a.total_expense,
    a.expense_count,
    ROUND(
      a.total_expense / NULLIF(g.total, 0) * 100,
      2
    )                                                                          AS percentage
  FROM aggregated a, grand_total g
  ORDER BY a.total_expense DESC, a.category;
END;
$$;


ALTER FUNCTION "public"."get_expense_breakdown_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_guest_source_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("source_name" "text", "transaction_count" bigint, "total_revenue" numeric, "percentage" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')::TEXT AS source_name,
      COUNT(*)                                                                         AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                                AS revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
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
    a.tx_count                                                                         AS transaction_count,
    a.revenue                                                                          AS total_revenue,
    ROUND(
      a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100,
      2
    )                                                                                  AS percentage,
    c.cnt                                                                              AS total_count
  FROM aggregated a, grand_total g, counted c
  ORDER BY a.tx_count DESC, a.source_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_guest_source_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_location_fullness"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("apartment_location" "text", "total_rooms" integer, "peak_occupancy_rate" numeric, "avg_occupancy_rate" numeric, "total_transactions" bigint, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  -- Sumber otoritatif jumlah unit per lokasi: tabel nomor_kamar.
  rooms_count AS (
    SELECT
      nk.lokasi::TEXT                                                          AS apartment_location,
      COUNT(*)::INT                                                            AS rooms_count
    FROM public.nomor_kamar nk
    GROUP BY nk.lokasi
  ),
  locations AS (
    SELECT
      la.name::TEXT                                                            AS apartment_location,
      -- Prioritas: nomor_kamar > la.total_rooms > 0
      COALESCE(rc.rooms_count, NULLIF(la.total_rooms, 0), 0)                   AS total_rooms
    FROM public.lokasi_apartemen la
    LEFT JOIN rooms_count rc ON rc.apartment_location = la.name
    WHERE (p_location IS NULL OR la.name = p_location)
  ),
  daily_occupancy AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')                          AS checkin_date,
      COUNT(DISTINCT t.room_number)                                            AS rooms_occupied
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location, DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  location_stats AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      COUNT(*)                                                                 AS total_transactions
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  occupancy_stats AS (
    SELECT
      do_data.apartment_location,
      ROUND(
        SUM(do_data.rooms_occupied::NUMERIC / NULLIF(loc.total_rooms, 0) * 100)
        / NULLIF(pd.total_days, 0),
        2
      )                                                                        AS avg_occupancy_rate,
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


ALTER FUNCTION "public"."get_location_fullness"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_marketing_performance"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("marketing_name" "text", "total_transactions" bigint, "revenue_brought" numeric, "total_fee" numeric, "fee_to_revenue_ratio" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')::TEXT AS marketing_name,
      COUNT(*)                                                                          AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                                 AS revenue_brought,
      ROUND(COALESCE(SUM(t.marketing_fee), 0), 2)                                       AS total_fee
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.marketing_name), ''), 'Langsung (Tanpa Marketing)')
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.marketing_name,
    a.tx_count                                                                 AS total_transactions,
    a.revenue_brought,
    a.total_fee,
    ROUND(
      a.total_fee / NULLIF(a.revenue_brought, 0) * 100,
      2
    )                                                                          AS fee_to_revenue_ratio,
    c.cnt                                                                      AS total_count
  FROM aggregated a, counted c
  ORDER BY a.revenue_brought DESC, a.marketing_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_marketing_performance"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("month_start" "date", "month_label" "text", "total_revenue" numeric, "transaction_count" bigint, "avg_revenue_per_transaction" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      DATE_TRUNC('month', t.checkin_at AT TIME ZONE 'Asia/Jakarta')::DATE       AS month_start,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS total_revenue,
      COUNT(*)                                                                  AS transaction_count
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY DATE_TRUNC('month', t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  )
  SELECT
    a.month_start,
    TO_CHAR(a.month_start, 'Mon YYYY')::TEXT                                   AS month_label,
    a.total_revenue,
    a.transaction_count,
    ROUND(a.total_revenue / NULLIF(a.transaction_count, 0), 2)                 AS avg_revenue_per_transaction
  FROM aggregated a
  ORDER BY a.month_start ASC;
END;
$$;


ALTER FUNCTION "public"."get_monthly_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_net_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("apartment_location" "text", "total_revenue" numeric, "total_expense" numeric, "net_profit" numeric, "profit_margin" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH revenue AS (
    SELECT
      t.apartment_location::TEXT                                               AS loc_name,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  expense AS (
    SELECT
      COALESCE(NULLIF(p.apartment_location, ''), '— Tanpa Lokasi —')::TEXT     AS loc_name,
      ROUND(SUM(p.jumlah), 2)                                                  AS total_expense
    FROM public.pengeluaran p
    WHERE p.tanggal BETWEEN p_start_date AND p_end_date
      AND (
        p_location IS NULL
        OR p.apartment_location = p_location
      )
    GROUP BY COALESCE(NULLIF(p.apartment_location, ''), '— Tanpa Lokasi —')
  ),
  -- Union dari revenue & expense agar lokasi tanpa transaksi tapi punya
  -- pengeluaran tetap muncul (dan sebaliknya).
  combined AS (
    SELECT loc_name FROM revenue
    UNION
    SELECT loc_name FROM expense
  ),
  joined AS (
    SELECT
      c.loc_name,
      COALESCE(r.total_revenue, 0)                                             AS total_revenue,
      COALESCE(e.total_expense, 0)                                             AS total_expense
    FROM combined c
    LEFT JOIN revenue r ON r.loc_name = c.loc_name
    LEFT JOIN expense e ON e.loc_name = c.loc_name
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM joined
  )
  SELECT
    j.loc_name                                                                 AS apartment_location,
    j.total_revenue,
    j.total_expense,
    ROUND(j.total_revenue - j.total_expense, 2)                                AS net_profit,
    ROUND(
      (j.total_revenue - j.total_expense) / NULLIF(j.total_revenue, 0) * 100,
      2
    )                                                                          AS profit_margin,
    c.cnt                                                                      AS total_count
  FROM joined j, counted c
  ORDER BY (j.total_revenue - j.total_expense) DESC, j.loc_name;
END;
$$;


ALTER FUNCTION "public"."get_net_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_occupancy_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("apartment_location" "text", "total_rooms" integer, "total_transactions" bigint, "total_revenue" numeric, "occupancy_rate" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  rooms_count AS (
    SELECT
      nk.lokasi::TEXT                                                          AS apartment_location,
      COUNT(*)::INT                                                            AS rooms_count
    FROM public.nomor_kamar nk
    GROUP BY nk.lokasi
  ),
  locations AS (
    SELECT
      la.name::TEXT                                                            AS apartment_location,
      COALESCE(rc.rooms_count, NULLIF(la.total_rooms, 0), 0)                   AS total_rooms
    FROM public.lokasi_apartemen la
    LEFT JOIN rooms_count rc ON rc.apartment_location = la.name
    WHERE (p_location IS NULL OR la.name = p_location)
  ),
  tx_stats AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      COUNT(*)                                                                 AS total_transactions,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  daily_occupancy AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')                          AS checkin_date,
      COUNT(DISTINCT t.room_number)                                            AS rooms_occupied
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location, DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta')
  ),
  occupancy_stats AS (
    SELECT
      do_data.apartment_location,
      ROUND(
        SUM(do_data.rooms_occupied::NUMERIC / NULLIF(loc.total_rooms, 0) * 100)
        / NULLIF(pd.total_days, 0),
        2
      )                                                                        AS occupancy_rate
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
    COALESCE(ts.total_transactions, 0)                                         AS total_transactions,
    COALESCE(ts.total_revenue, 0)                                              AS total_revenue,
    CASE WHEN loc.total_rooms IS NULL OR loc.total_rooms = 0
      THEN NULL
      ELSE os.occupancy_rate
    END                                                                        AS occupancy_rate,
    c.cnt                                                                      AS total_count
  FROM locations loc
  LEFT JOIN tx_stats ts ON ts.apartment_location = loc.apartment_location
  LEFT JOIN occupancy_stats os ON os.apartment_location = loc.apartment_location
  CROSS JOIN counted c
  ORDER BY
    COALESCE(ts.total_transactions, 0) DESC,
    loc.apartment_location;
END;
$$;


ALTER FUNCTION "public"."get_occupancy_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_occupancy_per_unit"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("room_number" "text", "apartment_location" "text", "total_transactions" bigint, "total_revenue" numeric, "occupancy_rate" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      t.room_number::TEXT        AS room_number,
      t.apartment_location::TEXT AS apartment_location,
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


ALTER FUNCTION "public"."get_occupancy_per_unit"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_outstanding_bills_summary"("p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("aging_bucket" "text", "bucket_order" integer, "bill_count" bigint, "total_amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  RETURN QUERY
  WITH bills AS (
    SELECT
      tb.amount,
      (v_today - tb.due_date) AS days_overdue
    FROM public.tagihan_bulanan tb
    WHERE tb.status = 'unpaid'
      AND (p_location IS NULL OR tb.apartment_location = p_location)
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN days_overdue < 0                       THEN 'Belum Jatuh Tempo'
        WHEN days_overdue BETWEEN 0 AND 30          THEN '0–30 hari'
        WHEN days_overdue BETWEEN 31 AND 60         THEN '31–60 hari'
        WHEN days_overdue BETWEEN 61 AND 90         THEN '61–90 hari'
        ELSE                                              '>90 hari'
      END                                                                      AS aging_bucket,
      CASE
        WHEN days_overdue < 0                       THEN 1
        WHEN days_overdue BETWEEN 0 AND 30          THEN 2
        WHEN days_overdue BETWEEN 31 AND 60         THEN 3
        WHEN days_overdue BETWEEN 61 AND 90         THEN 4
        ELSE                                              5
      END                                                                      AS bucket_order,
      amount
    FROM bills
  ),
  aggregated AS (
    SELECT
      b.aging_bucket,
      MIN(b.bucket_order)                                                      AS bucket_order,
      COUNT(*)                                                                 AS bill_count,
      ROUND(SUM(b.amount), 2)                                                  AS total_amount
    FROM bucketed b
    GROUP BY b.aging_bucket
  )
  SELECT
    a.aging_bucket::TEXT,
    a.bucket_order,
    a.bill_count,
    a.total_amount
  FROM aggregated a
  ORDER BY a.bucket_order;
END;
$$;


ALTER FUNCTION "public"."get_outstanding_bills_summary"("p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payment_method_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("apartment_location" "text", "total_cash" numeric, "total_transfer" numeric, "total_revenue" numeric, "cash_percentage" numeric, "transfer_percentage" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      t.apartment_location::TEXT                                               AS apartment_location,
      ROUND(SUM(t.cash_amount), 2)                                             AS total_cash,
      ROUND(SUM(t.transfer_amount), 2)                                         AS total_transfer,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.apartment_location
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.apartment_location,
    a.total_cash,
    a.total_transfer,
    a.total_revenue,
    ROUND(a.total_cash / NULLIF(a.total_revenue, 0) * 100, 2)                  AS cash_percentage,
    ROUND(a.total_transfer / NULLIF(a.total_revenue, 0) * 100, 2)              AS transfer_percentage,
    c.cnt                                                                      AS total_count
  FROM aggregated a, counted c
  ORDER BY a.total_revenue DESC, a.apartment_location;
END;
$$;


ALTER FUNCTION "public"."get_payment_method_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_performance_by_employee"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("employee_name" "text", "total_transactions" bigint, "total_revenue" numeric, "avg_revenue_per_transaction" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      COALESCE(NULLIF(TRIM(t.input_by), ''), 'Tidak Diketahui')::TEXT          AS employee_name,
      COUNT(*)                                                                 AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.input_by), ''), 'Tidak Diketahui')
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM aggregated
  )
  SELECT
    a.employee_name,
    a.tx_count                                                                 AS total_transactions,
    a.revenue                                                                  AS total_revenue,
    ROUND(a.revenue / NULLIF(a.tx_count, 0), 2)                                AS avg_revenue_per_transaction,
    c.cnt                                                                      AS total_count
  FROM aggregated a, counted c
  ORDER BY a.tx_count DESC, a.employee_name
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_performance_by_employee"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_performance_by_shift"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("shift" "text", "total_transactions" bigint, "total_revenue" numeric, "avg_revenue_per_transaction" numeric, "percentage" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH aggregated AS (
    SELECT
      COALESCE(NULLIF(TRIM(t.shift), ''), 'Tidak Diisi')::TEXT                  AS shift,
      COUNT(*)                                                                  AS tx_count,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY COALESCE(NULLIF(TRIM(t.shift), ''), 'Tidak Diisi')
  ),
  grand_total AS (
    SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
  )
  SELECT
    a.shift,
    a.tx_count                                                                 AS total_transactions,
    a.revenue                                                                  AS total_revenue,
    ROUND(a.revenue / NULLIF(a.tx_count, 0), 2)                                AS avg_revenue_per_transaction,
    ROUND(a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100, 2)                   AS percentage
  FROM aggregated a, grand_total g
  ORDER BY a.tx_count DESC, a.shift;
END;
$$;


ALTER FUNCTION "public"."get_performance_by_shift"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("apartment_location" "text", "total_revenue" numeric, "total_transactions" bigint, "avg_revenue_per_transaction" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  SELECT
    t.apartment_location::TEXT                                                AS apartment_location,
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


ALTER FUNCTION "public"."get_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_repeat_guests"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("customer_name" "text", "visit_count" bigint, "total_revenue" numeric, "first_visit" "date", "last_visit" "date", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH normalized AS (
    SELECT
      LOWER(TRIM(t.customer_name))                                             AS name_key,
      t.customer_name::TEXT                                                    AS original_name,
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


ALTER FUNCTION "public"."get_repeat_guests"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_revenue_yoy_comparison"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("current_revenue" numeric, "current_transactions" bigint, "previous_revenue" numeric, "previous_transactions" bigint, "revenue_change_pct" numeric, "transactions_change_pct" numeric, "current_period_label" "text", "previous_period_label" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_prev_start DATE := (p_start_date - INTERVAL '1 year')::DATE;
  v_prev_end   DATE := (p_end_date   - INTERVAL '1 year')::DATE;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                 AS tx_count
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  prev AS (
    SELECT
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                         AS revenue,
      COUNT(*)                                                                 AS tx_count
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN v_prev_start AND v_prev_end
      AND (p_location IS NULL OR t.apartment_location = p_location)
  )
  SELECT
    COALESCE(c.revenue, 0)                                                     AS current_revenue,
    COALESCE(c.tx_count, 0)                                                    AS current_transactions,
    COALESCE(p.revenue, 0)                                                     AS previous_revenue,
    COALESCE(p.tx_count, 0)                                                    AS previous_transactions,
    ROUND(
      (COALESCE(c.revenue, 0) - COALESCE(p.revenue, 0))
        / NULLIF(p.revenue, 0) * 100,
      2
    )                                                                          AS revenue_change_pct,
    ROUND(
      (COALESCE(c.tx_count, 0) - COALESCE(p.tx_count, 0))::NUMERIC
        / NULLIF(p.tx_count, 0) * 100,
      2
    )                                                                          AS transactions_change_pct,
    (TO_CHAR(p_start_date, 'DD Mon YYYY') || ' – ' || TO_CHAR(p_end_date, 'DD Mon YYYY'))::TEXT
                                                                                AS current_period_label,
    (TO_CHAR(v_prev_start, 'DD Mon YYYY') || ' – ' || TO_CHAR(v_prev_end, 'DD Mon YYYY'))::TEXT
                                                                                AS previous_period_label
  FROM cur c, prev p;
END;
$$;


ALTER FUNCTION "public"."get_revenue_yoy_comparison"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_stay_duration_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text") RETURNS TABLE("duration_category" "text", "duration_sort_key" integer, "transaction_count" bigint, "percentage" numeric, "total_revenue" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH categorized AS (
    SELECT
      CASE
        WHEN t.rental_duration BETWEEN 1 AND 11
          THEN 'Transit - ' || t.rental_duration::TEXT || ' Jam'
        WHEN t.rental_duration BETWEEN 12 AND 23                      THEN 'Fullday'
        WHEN t.rental_duration BETWEEN 24 AND 47                      THEN 'Per Malam - 1 Malam'
        WHEN t.rental_duration >= 48                                  THEN 'Per Malam - 2+ Malam'
        ELSE                                                               'Lainnya'
      END::TEXT                                                                AS duration_category,
      -- Sort key untuk urutan natural di chart (kecil ke besar)
      CASE
        WHEN t.rental_duration BETWEEN 1 AND 11                       THEN t.rental_duration
        WHEN t.rental_duration BETWEEN 12 AND 23                      THEN 100
        WHEN t.rental_duration BETWEEN 24 AND 47                      THEN 200
        WHEN t.rental_duration >= 48                                  THEN 300
        ELSE                                                               999
      END                                                                      AS duration_sort_key,
      t.cash_amount,
      t.transfer_amount
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
  ),
  aggregated AS (
    SELECT
      c.duration_category,
      MIN(c.duration_sort_key)                                                 AS sort_key,
      COUNT(*)                                                                 AS tx_count,
      ROUND(SUM(c.cash_amount + c.transfer_amount), 2)                        AS revenue
    FROM categorized c
    GROUP BY c.duration_category
  ),
  grand_total AS (
    SELECT COALESCE(SUM(a.tx_count), 0) AS total FROM aggregated a
  )
  SELECT
    a.duration_category,
    a.sort_key                                                                 AS duration_sort_key,
    a.tx_count                                                                 AS transaction_count,
    ROUND(
      a.tx_count::NUMERIC / NULLIF(g.total, 0) * 100,
      2
    )                                                                          AS percentage,
    a.revenue                                                                  AS total_revenue
  FROM aggregated a, grand_total g
  ORDER BY a.sort_key, a.duration_category;
END;
$$;


ALTER FUNCTION "public"."get_stay_duration_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_underperforming_rooms"("p_start_date" "date", "p_end_date" "date", "p_location" "text" DEFAULT NULL::"text", "p_threshold_pct" numeric DEFAULT 30, "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("room_number" "text", "apartment_location" "text", "total_transactions" bigint, "total_revenue" numeric, "occupancy_rate" numeric, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date dan p_end_date tidak boleh NULL';
  END IF;

  RETURN QUERY
  WITH period_days AS (
    SELECT (p_end_date - p_start_date + 1) AS total_days
  ),
  -- Master daftar kamar dari tabel nomor_kamar
  rooms AS (
    SELECT
      nk.name::TEXT                                                            AS room_number,
      nk.lokasi::TEXT                                                          AS apartment_location
    FROM public.nomor_kamar nk
    WHERE (p_location IS NULL OR nk.lokasi = p_location)
  ),
  -- Statistik per kamar dalam periode
  stats AS (
    SELECT
      t.room_number::TEXT                                                      AS room_number,
      t.apartment_location::TEXT                                               AS apartment_location,
      COUNT(*)                                                                 AS total_transactions,
      ROUND(SUM(t.cash_amount + t.transfer_amount), 2)                        AS total_revenue,
      COUNT(DISTINCT DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta'))           AS days_used
    FROM public.transactions t
    WHERE DATE(t.checkin_at AT TIME ZONE 'Asia/Jakarta') BETWEEN p_start_date AND p_end_date
      AND (p_location IS NULL OR t.apartment_location = p_location)
    GROUP BY t.room_number, t.apartment_location
  ),
  joined AS (
    SELECT
      r.room_number,
      r.apartment_location,
      COALESCE(s.total_transactions, 0)                                        AS total_transactions,
      COALESCE(s.total_revenue, 0)                                             AS total_revenue,
      ROUND(
        COALESCE(s.days_used, 0)::NUMERIC / NULLIF(pd.total_days, 0) * 100,
        2
      )                                                                        AS occupancy_rate
    FROM rooms r
    LEFT JOIN stats s
      ON s.room_number = r.room_number
     AND s.apartment_location = r.apartment_location
    CROSS JOIN period_days pd
  ),
  filtered AS (
    SELECT *
    FROM joined j
    WHERE j.occupancy_rate < p_threshold_pct
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.room_number,
    f.apartment_location,
    f.total_transactions,
    f.total_revenue,
    f.occupancy_rate,
    c.cnt                                                                      AS total_count
  FROM filtered f, counted c
  ORDER BY f.occupancy_rate ASC, f.apartment_location, f.room_number
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_underperforming_rooms"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_threshold_pct" numeric, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT full_name FROM public.user_profiles WHERE id = p_user_id),
    (SELECT email FROM auth.users WHERE id = p_user_id),
    'Pengguna'
  );
$$;


ALTER FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_transaction_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.notifications (
        type,
        title,
        body,
        audience_role,
        data
    ) VALUES (
        'new_transaction',
        'Transaksi Baru!',
        'Customer ' || NEW.customer_name || ' di ' || NEW.apartment_location || ' - ' || NEW.room_number,
        'admin', -- Admin dan Super Admin akan menerima notifikasi ini
        jsonb_build_object(
            'transaction_id', NEW.id,
            'location', NEW.apartment_location,
            'room', NEW.room_number
        )
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_transaction_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_activity"("p_action" "text", "p_details" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_name text;
    v_role text;
BEGIN
    SELECT full_name, role 
    INTO v_user_name, v_role
    FROM public.user_profiles
    WHERE id = auth.uid();

    INSERT INTO public.activity_logs (user_id, user_name, role, action, details, metadata)
    VALUES (auth.uid(), v_user_name, v_role, p_action, p_details, p_metadata);
END;
$$;


ALTER FUNCTION "public"."log_activity"("p_action" "text", "p_details" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_checkin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_title  text;
  v_body   text;
  v_dedupe text;
  v_checkin_label text;
  v_duration_label text;
BEGIN
  -- Format waktu checkin WIB
  v_checkin_label := to_char(
    COALESCE(NEW.checkin_at, NEW.created_at) AT TIME ZONE 'Asia/Jakarta',
    'DD Mon YYYY HH24:MI'
  ) || ' WIB';

  -- Format durasi
  v_duration_label := CASE
    WHEN NEW.rental_duration >= 24 THEN format('%s malam', NEW.rental_duration / 24)
    ELSE format('%s jam', NEW.rental_duration)
  END;

  v_title := format('🏠 Check-in Baru: %s', NEW.apartment_location || ' ' || NEW.room_number);
  v_body  := format(
    '%s check-in di %s - %s. Durasi: %s. Check-in: %s. Input oleh: %s.',
    NEW.customer_name,
    NEW.apartment_location,
    NEW.room_number,
    v_duration_label,
    v_checkin_label,
    NEW.input_by
  );
  v_dedupe := format('new_checkin:tx:%s', NEW.id);

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_checkin', v_title, v_body,
    jsonb_build_object(
      'transaction_id', NEW.id,
      'customer_name', NEW.customer_name,
      'apartment_location', NEW.apartment_location,
      'room_number', NEW.room_number,
      'checkin_at', COALESCE(NEW.checkin_at, NEW.created_at),
      'rental_duration', NEW.rental_duration,
      'input_by', NEW.input_by
    ),
    v_dedupe || ':admin', 'admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_checkin', v_title, v_body,
    jsonb_build_object(
      'transaction_id', NEW.id,
      'customer_name', NEW.customer_name,
      'apartment_location', NEW.apartment_location,
      'room_number', NEW.room_number,
      'checkin_at', COALESCE(NEW.checkin_at, NEW.created_at),
      'rental_duration', NEW.rental_duration,
      'input_by', NEW.input_by
    ),
    v_dedupe || ':super_admin', 'super_admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_new_checkin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_title text;
  v_body  text;
  v_dedupe text;
BEGIN
  v_title := format('📋 Request Baru: %s', NEW.request_type);
  v_body  := format(
    '%s mengajukan request "%s" untuk lokasi %s pada %s.',
    NEW.employee_name,
    NEW.request_type,
    NEW.apartment_location,
    to_char((NEW.desired_date AT TIME ZONE 'Asia/Jakarta'), 'DD Mon YYYY')
  );
  v_dedupe := format('new_request:%s', NEW.id);

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_request', v_title, v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'request_type', NEW.request_type,
      'employee_name', NEW.employee_name,
      'apartment_location', NEW.apartment_location
    ),
    v_dedupe || ':admin', 'admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_request', v_title, v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'request_type', NEW.request_type,
      'employee_name', NEW.employee_name,
      'apartment_location', NEW.apartment_location
    ),
    v_dedupe || ':super_admin', 'super_admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_new_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_request_response"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_title    text;
  v_body     text;
  v_dedupe   text;
  v_admin_name text;
  v_status_label text;
BEGIN
  -- Hanya trigger jika status berubah ke Approved atau Rejected
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('Approved', 'Rejected') THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  -- Ambil nama admin yang mengubah (dari current user context)
  -- Karena trigger berjalan dengan SECURITY DEFINER, kita pakai auth.uid()
  v_admin_name := public.get_user_display_name(auth.uid());

  v_status_label := CASE NEW.status WHEN 'Approved' THEN 'disetujui ✅' ELSE 'ditolak ❌' END;

  v_title := format('Request %s', v_status_label);
  v_body  := format(
    'Request "%s" untuk lokasi %s telah %s oleh %s.',
    NEW.request_type,
    NEW.apartment_location,
    v_status_label,
    v_admin_name
  );
  v_dedupe := format('request_response:%s:%s', NEW.id, NEW.status);

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_user_id)
  VALUES (
    'request_response',
    v_title,
    v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'request_type', NEW.request_type,
      'status', NEW.status,
      'admin_name', v_admin_name
    ),
    v_dedupe,
    NEW.user_id
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_request_response"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_fee_items"("p_marketing_name" "text", "p_transaction_ids" bigint[], "p_proof_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_items_inserted int := 0;
  v_total_fee numeric := 0;
  v_paid_at timestamptz := now();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak valid.';
  END IF;

  IF p_marketing_name IS NULL OR btrim(p_marketing_name) = '' THEN
    RAISE EXCEPTION 'Marketing tidak valid.';
  END IF;

  IF p_transaction_ids IS NULL OR array_length(p_transaction_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Tidak ada transaksi yang dibayarkan.';
  END IF;

  -- Hitung total fee dari transaksi yang valid (marketing match + fee > 0)
  SELECT COALESCE(sum(t.marketing_fee), 0)
  INTO v_total_fee
  FROM public.transactions t
  WHERE t.id = ANY(p_transaction_ids)
    AND t.marketing_name = p_marketing_name
    AND COALESCE(t.marketing_fee, 0) > 0;

  -- Insert items; ON CONFLICT do nothing supaya idempotent per transaction_id
  INSERT INTO public.tagihan_fee_lunas_items (
    transaction_id, marketing_name, fee_amount, paid_at, paid_by, proof_url
  )
  SELECT
    t.id,
    p_marketing_name,
    COALESCE(t.marketing_fee, 0),
    v_paid_at,
    v_user_id,
    p_proof_url
  FROM public.transactions t
  WHERE t.id = ANY(p_transaction_ids)
    AND t.marketing_name = p_marketing_name
    AND COALESCE(t.marketing_fee, 0) > 0
  ON CONFLICT (transaction_id) DO NOTHING;

  GET DIAGNOSTICS v_items_inserted = ROW_COUNT;

  -- Catat ke pengeluaran dengan category = 'Fee Marketing'
  IF v_total_fee > 0 THEN
    INSERT INTO public.pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, category, user_id)
    VALUES (
      format('Bayar Fee Marketing %s', p_marketing_name),
      v_total_fee,
      (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
      format('%s customer.', v_items_inserted),
      'Fee Marketing',
      v_user_id
    );
  END IF;

  -- Simpan "receipt" untuk kompatibilitas history/share (opsional)
  INSERT INTO public.tagihan_fee_lunas (
    marketing_name, customer_count, total_fee, transactions_detail, proof_url, paid_at, user_id
  )
  VALUES (
    p_marketing_name,
    v_items_inserted,
    v_total_fee,
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'transaction_id', t.id,
            'customer', t.customer_name,
            'location', t.apartment_location
          )
        ),
        '[]'::jsonb
      )
      FROM public.transactions t
      WHERE t.id = ANY(p_transaction_ids)
        AND t.marketing_name = p_marketing_name
        AND COALESCE(t.marketing_fee, 0) > 0
    ),
    p_proof_url,
    v_paid_at,
    v_user_id
  );

  RETURN jsonb_build_object(
    'items_inserted', v_items_inserted,
    'total_fee', v_total_fee,
    'paid_at', v_paid_at
  );
END;
$$;


ALTER FUNCTION "public"."pay_fee_items"("p_marketing_name" "text", "p_transaction_ids" bigint[], "p_proof_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_tagihan_bulanan"("p_tagihan_id" bigint, "p_proof_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_paid_at timestamptz := now();
  v_row public.tagihan_bulanan%ROWTYPE;
  v_next_due_date date;
  v_existing_id bigint;
  v_new_tagihan_id bigint := NULL;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak valid.';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tagihan_bulanan
  WHERE id = p_tagihan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan.';
  END IF;

  -- Mark lunas
  UPDATE public.tagihan_bulanan
  SET
    status   = 'paid',
    paid_at  = v_paid_at,
    proof_url = COALESCE(p_proof_url, proof_url)
  WHERE id = p_tagihan_id;

  -- Catat ke pengeluaran (kategori "Tagihan Unit")
  INSERT INTO public.pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, category, user_id)
  VALUES (
    format('Bayar Tagihan Unit %s - %s', v_row.apartment_location, v_row.room_number),
    v_row.amount,
    (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
    format('Tagihan lunas pada %s %s %s %s WIB',
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'DD'),
      CASE EXTRACT(MONTH FROM v_paid_at AT TIME ZONE 'Asia/Jakarta')
        WHEN 1  THEN 'Jan' WHEN 2  THEN 'Feb' WHEN 3  THEN 'Mar'
        WHEN 4  THEN 'Apr' WHEN 5  THEN 'Mei' WHEN 6  THEN 'Jun'
        WHEN 7  THEN 'Jul' WHEN 8  THEN 'Agu' WHEN 9  THEN 'Sep'
        WHEN 10 THEN 'Okt' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Des'
      END,
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY'),
      to_char(v_paid_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI')
    ),
    'Tagihan Unit',
    v_user_id
  );

  -- Generate tagihan periode berikutnya jika recurring
  IF COALESCE(v_row.is_recurring, FALSE) THEN
    v_next_due_date := (v_row.due_date + INTERVAL '1 month')::date;

    -- Anti-duplikasi: skip jika sudah ada tagihan untuk unit yang sama pada
    -- jatuh tempo berikutnya (status apa pun, agar tidak duplikat).
    SELECT id INTO v_existing_id
    FROM public.tagihan_bulanan
    WHERE apartment_location = v_row.apartment_location
      AND room_number        = v_row.room_number
      AND due_date           = v_next_due_date
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.tagihan_bulanan (
        apartment_location, room_number, amount, due_date,
        status, is_recurring, recurring_parent_id, user_id
      )
      VALUES (
        v_row.apartment_location,
        v_row.room_number,
        v_row.amount,
        v_next_due_date,
        'unpaid',
        TRUE,
        v_row.id,
        v_user_id
      )
      RETURNING id INTO v_new_tagihan_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tagihan_id',          p_tagihan_id,
    'paid_at',             v_paid_at,
    'next_tagihan_id',     v_new_tagihan_id,
    'next_due_date',       v_next_due_date,
    'next_already_exists', (v_existing_id IS NOT NULL)
  );
END;
$$;


ALTER FUNCTION "public"."pay_tagihan_bulanan"("p_tagihan_id" bigint, "p_proof_url" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" integer NOT NULL,
    "customer_name" character varying(255) NOT NULL,
    "marketing_name" character varying(255) NOT NULL,
    "rental_duration" integer NOT NULL,
    "shift" character varying(50),
    "input_by" character varying(255) NOT NULL,
    "apartment_location" character varying(255) NOT NULL,
    "room_number" character varying(255) NOT NULL,
    "cash_amount" numeric(15,2) DEFAULT 0,
    "transfer_amount" numeric(15,2) DEFAULT 0,
    "transfer_to" character varying(255),
    "marketing_fee" numeric(15,2) DEFAULT 0,
    "ktp_image_url" "text",
    "transfer_proof_url" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "checkout_at" timestamp with time zone,
    "deposit_cash" numeric(12,2) DEFAULT 0,
    "deposit_transfer" numeric(12,2) DEFAULT 0,
    "deposit_returned_at" timestamp with time zone,
    "deposit_refund_proof_url" "text",
    "checkin_at" timestamp with time zone
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."transactions"."deposit_cash" IS 'Deposit tunai customer — TIDAK masuk omset';



COMMENT ON COLUMN "public"."transactions"."deposit_transfer" IS 'Deposit transfer customer — TIDAK masuk omset';



COMMENT ON COLUMN "public"."transactions"."deposit_returned_at" IS 'Waktu kapan deposit dikembalikan ke penyewa';



COMMENT ON COLUMN "public"."transactions"."deposit_refund_proof_url" IS 'URL bukti transfer pengembalian deposit (opsional)';



CREATE OR REPLACE FUNCTION "public"."update_transaction_by_privileged_role"("p_transaction_id" bigint, "p_payload" "jsonb") RETURNS "public"."transactions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_role TEXT;
    v_tx public.transactions%ROWTYPE;
BEGIN
    SELECT ur.role
    INTO v_user_role
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    LIMIT 1;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesi tidak valid.';
    END IF;

    IF COALESCE(v_user_role, 'karyawan') NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Akses ditolak untuk mengubah transaksi ini.';
    END IF;

    UPDATE public.transactions
    SET
        customer_name = COALESCE(p_payload->>'customer_name', customer_name),
        marketing_name = COALESCE(p_payload->>'marketing_name', marketing_name),
        rental_duration = COALESCE(NULLIF(p_payload->>'rental_duration', '')::INTEGER, rental_duration),
        shift = COALESCE(p_payload->>'shift', shift),
        input_by = COALESCE(p_payload->>'input_by', input_by),
        apartment_location = COALESCE(p_payload->>'apartment_location', apartment_location),
        room_number = COALESCE(p_payload->>'room_number', room_number),
        cash_amount = COALESCE(NULLIF(p_payload->>'cash_amount', '')::NUMERIC, cash_amount),
        transfer_amount = COALESCE(NULLIF(p_payload->>'transfer_amount', '')::NUMERIC, transfer_amount),
        transfer_to = CASE
            WHEN p_payload ? 'transfer_to' THEN NULLIF(p_payload->>'transfer_to', '')
            ELSE transfer_to
        END,
        marketing_fee = COALESCE(NULLIF(p_payload->>'marketing_fee', '')::NUMERIC, marketing_fee)
    WHERE id = p_transaction_id
    RETURNING * INTO v_tx;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi tidak ditemukan.';
    END IF;

    RETURN v_tx;
END;
$$;


ALTER FUNCTION "public"."update_transaction_by_privileged_role"("p_transaction_id" bigint, "p_payload" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "user_name" character varying(255),
    "role" character varying(50),
    "action" character varying(255) NOT NULL,
    "details" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."activity_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."activity_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activity_logs_id_seq" OWNED BY "public"."activity_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."karyawan_list" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."karyawan_list" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."karyawan_list_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."karyawan_list_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."karyawan_list_id_seq" OWNED BY "public"."karyawan_list"."id";



CREATE TABLE IF NOT EXISTS "public"."lokasi_apartemen" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "total_rooms" integer DEFAULT 0
);


ALTER TABLE "public"."lokasi_apartemen" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lokasi_apartemen_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lokasi_apartemen_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lokasi_apartemen_id_seq" OWNED BY "public"."lokasi_apartemen"."id";



CREATE TABLE IF NOT EXISTS "public"."marketing_list" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."marketing_list" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."marketing_list_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."marketing_list_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."marketing_list_id_seq" OWNED BY "public"."marketing_list"."id";



CREATE TABLE IF NOT EXISTS "public"."menu_access_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "role" character varying(50),
    "menu_item_id" character varying(100) NOT NULL,
    "action" character varying(50) DEFAULT 'visit'::character varying NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."menu_access_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."menu_access_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."menu_access_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."menu_access_logs_id_seq" OWNED BY "public"."menu_access_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."menu_configuration" (
    "id" bigint NOT NULL,
    "menu_item_id" character varying(100) NOT NULL,
    "label" character varying(255),
    "category" character varying(100),
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."menu_configuration" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."menu_configuration_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."menu_configuration_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."menu_configuration_id_seq" OWNED BY "public"."menu_configuration"."id";



CREATE TABLE IF NOT EXISTS "public"."nomor_kamar" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "lokasi" character varying(255) NOT NULL,
    "status" character varying(50) DEFAULT 'available'::character varying,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."nomor_kamar" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."nomor_kamar_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."nomor_kamar_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."nomor_kamar_id_seq" OWNED BY "public"."nomor_kamar"."id";



CREATE TABLE IF NOT EXISTS "public"."notification_hidden" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "hidden_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notification_hidden" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "push_enabled" boolean DEFAULT true NOT NULL,
    "types_enabled" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_reads" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "dedupe_key" "text",
    "audience_role" "text",
    "audience_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pengeluaran" (
    "id" integer NOT NULL,
    "nama_pengeluaran" character varying(255) NOT NULL,
    "jumlah" numeric(15,2) NOT NULL,
    "tanggal" "date" NOT NULL,
    "keterangan" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "category" character varying(100),
    "apartment_location" character varying(255),
    "room_number" character varying(255)
);


ALTER TABLE "public"."pengeluaran" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pengeluaran_categories" (
    "id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."pengeluaran_categories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pengeluaran_categories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pengeluaran_categories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pengeluaran_categories_id_seq" OWNED BY "public"."pengeluaran_categories"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."pengeluaran_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pengeluaran_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pengeluaran_id_seq" OWNED BY "public"."pengeluaran"."id";



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."push_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."push_subscriptions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."push_subscriptions_id_seq" OWNED BY "public"."push_subscriptions"."id";



CREATE TABLE IF NOT EXISTS "public"."requests" (
    "id" integer NOT NULL,
    "employee_name" character varying(255) NOT NULL,
    "apartment_location" character varying(255) NOT NULL,
    "request_type" character varying(255) NOT NULL,
    "description" "text",
    "amount" numeric(15,2),
    "desired_date" "date" NOT NULL,
    "status" character varying(50) DEFAULT 'Pending'::character varying,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."requests" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."requests_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."requests_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."requests_id_seq" OWNED BY "public"."requests"."id";



CREATE TABLE IF NOT EXISTS "public"."role_menu_visibility" (
    "id" bigint NOT NULL,
    "role" character varying(50) NOT NULL,
    "menu_item_id" character varying(100) NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."role_menu_visibility" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."role_menu_visibility_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."role_menu_visibility_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."role_menu_visibility_id_seq" OWNED BY "public"."role_menu_visibility"."id";



CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" bigint NOT NULL,
    "key" character varying(255) NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."system_settings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."system_settings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."system_settings_id_seq" OWNED BY "public"."system_settings"."id";



CREATE TABLE IF NOT EXISTS "public"."tagihan_bulanan" (
    "id" integer NOT NULL,
    "apartment_location" character varying(255) NOT NULL,
    "room_number" character varying(255) NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "due_date" "date" NOT NULL,
    "status" character varying(50) DEFAULT 'unpaid'::character varying,
    "paid_at" timestamp with time zone,
    "proof_url" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurring_parent_id" bigint
);


ALTER TABLE "public"."tagihan_bulanan" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tagihan_bulanan_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tagihan_bulanan_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tagihan_bulanan_id_seq" OWNED BY "public"."tagihan_bulanan"."id";



CREATE TABLE IF NOT EXISTS "public"."tagihan_fee_lunas" (
    "id" integer NOT NULL,
    "marketing_name" character varying(255) NOT NULL,
    "customer_count" integer NOT NULL,
    "total_fee" numeric(15,2) NOT NULL,
    "transactions_detail" "jsonb",
    "proof_url" "text",
    "paid_at" timestamp with time zone NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "paid_date" "date" GENERATED ALWAYS AS ((("paid_at" AT TIME ZONE 'Asia/Jakarta'::"text"))::"date") STORED
);


ALTER TABLE "public"."tagihan_fee_lunas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tagihan_fee_lunas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tagihan_fee_lunas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tagihan_fee_lunas_id_seq" OWNED BY "public"."tagihan_fee_lunas"."id";



CREATE TABLE IF NOT EXISTS "public"."tagihan_fee_lunas_items" (
    "id" bigint NOT NULL,
    "transaction_id" bigint NOT NULL,
    "marketing_name" "text" NOT NULL,
    "fee_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_date" "date" GENERATED ALWAYS AS ((("paid_at" AT TIME ZONE 'Asia/Jakarta'::"text"))::"date") STORED,
    "paid_by" "uuid" NOT NULL,
    "proof_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."tagihan_fee_lunas_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tagihan_fee_lunas_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tagihan_fee_lunas_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tagihan_fee_lunas_items_id_seq" OWNED BY "public"."tagihan_fee_lunas_items"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."transactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."transactions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transactions_id_seq" OWNED BY "public"."transactions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_location_assignments" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_name" character varying(255) NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "assigned_by" "uuid"
);


ALTER TABLE "public"."user_location_assignments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_location_assignments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_location_assignments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_location_assignments_id_seq" OWNED BY "public"."user_location_assignments"."id";



CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission_key" character varying(255) NOT NULL,
    "is_allowed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_permissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_permissions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_permissions_id_seq" OWNED BY "public"."user_permissions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "full_name" character varying(255),
    "phone" character varying(50),
    "role" character varying(50) DEFAULT 'karyawan'::character varying NOT NULL,
    "last_sign_in_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "avatar_url" "text",
    "gender" character varying(20)
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" character varying(50) DEFAULT 'karyawan'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_roles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_roles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_roles_id_seq" OWNED BY "public"."user_roles"."id";



ALTER TABLE ONLY "public"."activity_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."activity_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."karyawan_list" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."karyawan_list_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lokasi_apartemen" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lokasi_apartemen_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."marketing_list" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."marketing_list_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."menu_access_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."menu_access_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."menu_configuration" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."menu_configuration_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."nomor_kamar" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."nomor_kamar_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pengeluaran" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pengeluaran_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pengeluaran_categories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pengeluaran_categories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."push_subscriptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."push_subscriptions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."requests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."requests_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."role_menu_visibility" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."role_menu_visibility_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."system_settings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."system_settings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tagihan_bulanan" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tagihan_bulanan_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tagihan_fee_lunas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tagihan_fee_lunas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tagihan_fee_lunas_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tagihan_fee_lunas_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transactions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_location_assignments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_location_assignments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_permissions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_permissions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_roles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_roles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."karyawan_list"
    ADD CONSTRAINT "karyawan_list_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."karyawan_list"
    ADD CONSTRAINT "karyawan_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lokasi_apartemen"
    ADD CONSTRAINT "lokasi_apartemen_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."lokasi_apartemen"
    ADD CONSTRAINT "lokasi_apartemen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_list"
    ADD CONSTRAINT "marketing_list_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."marketing_list"
    ADD CONSTRAINT "marketing_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_access_logs"
    ADD CONSTRAINT "menu_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_configuration"
    ADD CONSTRAINT "menu_configuration_menu_item_id_key" UNIQUE ("menu_item_id");



ALTER TABLE ONLY "public"."menu_configuration"
    ADD CONSTRAINT "menu_configuration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nomor_kamar"
    ADD CONSTRAINT "nomor_kamar_name_lokasi_key" UNIQUE ("name", "lokasi");



ALTER TABLE ONLY "public"."nomor_kamar"
    ADD CONSTRAINT "nomor_kamar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_hidden"
    ADD CONSTRAINT "notification_hidden_pkey" PRIMARY KEY ("notification_id", "user_id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pengeluaran_categories"
    ADD CONSTRAINT "pengeluaran_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."pengeluaran_categories"
    ADD CONSTRAINT "pengeluaran_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pengeluaran"
    ADD CONSTRAINT "pengeluaran_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_menu_visibility"
    ADD CONSTRAINT "role_menu_visibility_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_menu_visibility"
    ADD CONSTRAINT "role_menu_visibility_role_menu_item_id_key" UNIQUE ("role", "menu_item_id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tagihan_bulanan"
    ADD CONSTRAINT "tagihan_bulanan_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tagihan_fee_lunas_items"
    ADD CONSTRAINT "tagihan_fee_lunas_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tagihan_fee_lunas_items"
    ADD CONSTRAINT "tagihan_fee_lunas_items_transaction_id_key" UNIQUE ("transaction_id");



ALTER TABLE ONLY "public"."tagihan_fee_lunas"
    ADD CONSTRAINT "tagihan_fee_lunas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_location_assignments"
    ADD CONSTRAINT "user_location_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_location_assignments"
    ADD CONSTRAINT "user_location_assignments_user_id_location_name_key" UNIQUE ("user_id", "location_name");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_permission_key_key" UNIQUE ("user_id", "permission_key");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_activity_logs_created_at" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_notification_hidden_user_id" ON "public"."notification_hidden" USING "btree" ("user_id", "hidden_at" DESC);



CREATE INDEX "idx_tagihan_bulanan_unit_due" ON "public"."tagihan_bulanan" USING "btree" ("apartment_location", "room_number", "due_date");



CREATE INDEX "idx_tagihan_fee_lunas_items_marketing_paid_date" ON "public"."tagihan_fee_lunas_items" USING "btree" ("marketing_name", "paid_date");



CREATE INDEX "idx_tagihan_fee_lunas_items_paid_date_marketing" ON "public"."tagihan_fee_lunas_items" USING "btree" ("paid_date", "marketing_name");



CREATE INDEX "idx_tagihan_fee_lunas_paid_date" ON "public"."tagihan_fee_lunas" USING "btree" ("paid_date");



CREATE OR REPLACE TRIGGER "on_transaction_inserted" AFTER INSERT ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_transaction_notification"();



CREATE OR REPLACE TRIGGER "trg_notify_new_checkin" AFTER INSERT ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_checkin"();



CREATE OR REPLACE TRIGGER "trg_notify_new_request" AFTER INSERT ON "public"."requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_request"();



CREATE OR REPLACE TRIGGER "trg_notify_request_response" AFTER UPDATE ON "public"."requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_request_response"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_access_logs"
    ADD CONSTRAINT "menu_access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nomor_kamar"
    ADD CONSTRAINT "nomor_kamar_lokasi_fkey" FOREIGN KEY ("lokasi") REFERENCES "public"."lokasi_apartemen"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_hidden"
    ADD CONSTRAINT "notification_hidden_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_hidden"
    ADD CONSTRAINT "notification_hidden_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_audience_user_id_fkey" FOREIGN KEY ("audience_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pengeluaran"
    ADD CONSTRAINT "pengeluaran_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_apartment_location_fkey" FOREIGN KEY ("apartment_location") REFERENCES "public"."lokasi_apartemen"("name");



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tagihan_bulanan"
    ADD CONSTRAINT "tagihan_bulanan_apartment_location_fkey" FOREIGN KEY ("apartment_location") REFERENCES "public"."lokasi_apartemen"("name");



ALTER TABLE ONLY "public"."tagihan_bulanan"
    ADD CONSTRAINT "tagihan_bulanan_recurring_parent_id_fkey" FOREIGN KEY ("recurring_parent_id") REFERENCES "public"."tagihan_bulanan"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tagihan_bulanan"
    ADD CONSTRAINT "tagihan_bulanan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tagihan_fee_lunas_items"
    ADD CONSTRAINT "tagihan_fee_lunas_items_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tagihan_fee_lunas_items"
    ADD CONSTRAINT "tagihan_fee_lunas_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tagihan_fee_lunas"
    ADD CONSTRAINT "tagihan_fee_lunas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_apartment_location_fkey" FOREIGN KEY ("apartment_location") REFERENCES "public"."lokasi_apartemen"("name");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_location_assignments"
    ADD CONSTRAINT "user_location_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_location_assignments"
    ADD CONSTRAINT "user_location_assignments_location_name_fkey" FOREIGN KEY ("location_name") REFERENCES "public"."lokasi_apartemen"("name") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_location_assignments"
    ADD CONSTRAINT "user_location_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Enable all for admin/super_admin" ON "public"."system_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))));



CREATE POLICY "Enable delete for authenticated users" ON "public"."karyawan_list" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable delete for authenticated users" ON "public"."lokasi_apartemen" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "Enable delete for authenticated users" ON "public"."marketing_list" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable delete for authenticated users" ON "public"."nomor_kamar" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "Enable delete for authenticated users" ON "public"."pengeluaran" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable delete for authenticated users" ON "public"."requests" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND (("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))))));



CREATE POLICY "Enable delete for authenticated users" ON "public"."tagihan_bulanan" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable delete for authenticated users" ON "public"."tagihan_fee_lunas" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable delete for authenticated users" ON "public"."tagihan_fee_lunas_items" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "paid_by")));



CREATE POLICY "Enable delete for authenticated users" ON "public"."transactions" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable delete user roles for authenticated users" ON "public"."user_roles" FOR DELETE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable insert for authenticated users" ON "public"."karyawan_list" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."lokasi_apartemen" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "Enable insert for authenticated users" ON "public"."marketing_list" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."nomor_kamar" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "Enable insert for authenticated users" ON "public"."pengeluaran" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable insert for authenticated users" ON "public"."requests" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable insert for authenticated users" ON "public"."tagihan_bulanan" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable insert for authenticated users" ON "public"."tagihan_fee_lunas" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable insert for authenticated users" ON "public"."tagihan_fee_lunas_items" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "paid_by")));



CREATE POLICY "Enable insert for authenticated users" ON "public"."transactions" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable insert user roles for authenticated users" ON "public"."user_roles" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable manage for admin/super_admin" ON "public"."user_location_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))));



CREATE POLICY "Enable read access for authenticated users" ON "public"."karyawan_list" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."lokasi_apartemen" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."marketing_list" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."nomor_kamar" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."pengeluaran" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."requests" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."tagihan_bulanan" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."tagihan_fee_lunas" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."tagihan_fee_lunas_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for authenticated users" ON "public"."transactions" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read for admin/super_admin" ON "public"."activity_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))));



CREATE POLICY "Enable read for all authenticated users" ON "public"."system_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read for authenticated users" ON "public"."user_location_assignments" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read user roles for authenticated users" ON "public"."user_roles" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable update for authenticated users" ON "public"."karyawan_list" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable update for authenticated users" ON "public"."lokasi_apartemen" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))))) WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "Enable update for authenticated users" ON "public"."marketing_list" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable update for authenticated users" ON "public"."nomor_kamar" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))))) WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "Enable update for authenticated users" ON "public"."pengeluaran" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable update for authenticated users" ON "public"."requests" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND (("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))))) WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))))));



CREATE POLICY "Enable update for authenticated users" ON "public"."tagihan_bulanan" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable update for authenticated users" ON "public"."tagihan_fee_lunas" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable update for authenticated users" ON "public"."tagihan_fee_lunas_items" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "paid_by"))) WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "paid_by")));



CREATE POLICY "Enable update for authenticated users" ON "public"."transactions" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Enable update user roles for authenticated users" ON "public"."user_roles" FOR UPDATE USING ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "user_id")));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_can_delete_any_transaction" ON "public"."transactions" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "admin_can_select_all_transactions" ON "public"."transactions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "admin_can_update_any_transaction" ON "public"."transactions" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[]))))))) WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND (("user_roles"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



ALTER TABLE "public"."karyawan_list" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lokasi_apartemen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_list" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_access_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_access_logs_insert_authenticated" ON "public"."menu_access_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "menu_access_logs_read_superadmin" ON "public"."menu_access_logs" FOR SELECT USING ("public"."is_super_admin"());



ALTER TABLE "public"."menu_configuration" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_configuration_read_authenticated" ON "public"."menu_configuration" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "menu_configuration_write_superadmin" ON "public"."menu_configuration" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."nomor_kamar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_hidden" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_hidden_delete_self" ON "public"."notification_hidden" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_hidden_insert_self" ON "public"."notification_hidden" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_hidden_select_self" ON "public"."notification_hidden" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_preferences_select_self" ON "public"."notification_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_preferences_update_self" ON "public"."notification_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_preferences_upsert_self" ON "public"."notification_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notification_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_reads_insert_self" ON "public"."notification_reads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_reads_select_self" ON "public"."notification_reads" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notification_reads_update_self" ON "public"."notification_reads" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert_admin_or_superadmin" ON "public"."notifications" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = ANY ((ARRAY['admin'::character varying, 'super_admin'::character varying])::"text"[])))))));



CREATE POLICY "notifications_select_audience" ON "public"."notifications" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND (("audience_user_id" = "auth"."uid"()) OR ("audience_role" = 'all'::"text") OR (("audience_role" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND (("ur"."role")::"text" = "notifications"."audience_role"))))))));



ALTER TABLE "public"."pengeluaran" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pengeluaran_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pengeluaran_categories_delete_authenticated" ON "public"."pengeluaran_categories" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "pengeluaran_categories_insert_authenticated" ON "public"."pengeluaran_categories" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "pengeluaran_categories_read_authenticated" ON "public"."pengeluaran_categories" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "pengeluaran_categories_update_authenticated" ON "public"."pengeluaran_categories" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "profiles_delete_superadmin_only" ON "public"."user_profiles" FOR DELETE USING ("public"."is_super_admin"());



CREATE POLICY "profiles_insert_self_or_superadmin" ON "public"."user_profiles" FOR INSERT WITH CHECK ((("auth"."uid"() = "id") OR "public"."is_super_admin"()));



CREATE POLICY "profiles_select_self_or_superadmin" ON "public"."user_profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_super_admin"()));



CREATE POLICY "profiles_update_self_or_superadmin" ON "public"."user_profiles" FOR UPDATE USING ((("auth"."uid"() = "id") OR "public"."is_super_admin"()));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_delete_self" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_insert_self" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_select_self_or_superadmin" ON "public"."push_subscriptions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"()));



ALTER TABLE "public"."requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_menu_visibility" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_menu_visibility_read_authenticated" ON "public"."role_menu_visibility" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "role_menu_visibility_write_superadmin" ON "public"."role_menu_visibility" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_settings_read_authenticated" ON "public"."system_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "system_settings_write_superadmin" ON "public"."system_settings" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."tagihan_bulanan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tagihan_fee_lunas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tagihan_fee_lunas_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_location_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_permissions_read_self_or_superadmin" ON "public"."user_permissions" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_super_admin"()));



CREATE POLICY "user_permissions_write_superadmin" ON "public"."user_permissions" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_user"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_user"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_user"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_user"("p_email" "text", "p_password" "text", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_user"("p_target_user_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_user"("p_target_user_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_user"("p_target_user_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_user"("p_target_user_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_gender" "text", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_account_karyawan_admin"("p_full_name" "text", "p_phone" "text", "p_email" "text", "p_password" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_account_karyawan_admin"("p_full_name" "text", "p_phone" "text", "p_email" "text", "p_password" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_account_karyawan_admin"("p_full_name" "text", "p_phone" "text", "p_email" "text", "p_password" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_account_karyawan_admin"("p_full_name" "text", "p_phone" "text", "p_email" "text", "p_password" "text", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_transaction_cascade"("p_transaction_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_transaction_cascade"("p_transaction_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_transaction_cascade"("p_transaction_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_transaction_cascade"("p_transaction_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_category_summary"("p_lokasi" "text", "p_kamar" "text", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_category_summary"("p_lokasi" "text", "p_kamar" "text", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_category_summary"("p_lokasi" "text", "p_kamar" "text", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_checkin_heatmap"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_checkin_heatmap"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_checkin_heatmap"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_checkin_heatmap"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_daily_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_dashboard_kpis"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_kpis"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_expense_breakdown_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_expense_breakdown_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_expense_breakdown_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_expense_breakdown_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_guest_source_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_guest_source_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_guest_source_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_guest_source_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_location_fullness"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_location_fullness"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_location_fullness"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_location_fullness"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_marketing_performance"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_marketing_performance"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_marketing_performance"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_marketing_performance"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_monthly_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_monthly_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_revenue_trend"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_net_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_net_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_net_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_net_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_occupancy_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_occupancy_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_occupancy_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_occupancy_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_occupancy_per_unit"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_occupancy_per_unit"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_occupancy_per_unit"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_occupancy_per_unit"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_outstanding_bills_summary"("p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_outstanding_bills_summary"("p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_outstanding_bills_summary"("p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_outstanding_bills_summary"("p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_payment_method_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payment_method_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_method_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_method_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_performance_by_employee"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_performance_by_employee"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_performance_by_employee"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_performance_by_employee"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_performance_by_shift"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_performance_by_shift"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_performance_by_shift"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_performance_by_shift"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_profit_per_location"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_repeat_guests"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_repeat_guests"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_repeat_guests"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_repeat_guests"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_revenue_yoy_comparison"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_revenue_yoy_comparison"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_revenue_yoy_comparison"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_revenue_yoy_comparison"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_stay_duration_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_stay_duration_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_stay_duration_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stay_duration_summary"("p_start_date" "date", "p_end_date" "date", "p_location" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_underperforming_rooms"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_threshold_pct" numeric, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_underperforming_rooms"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_threshold_pct" numeric, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_underperforming_rooms"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_threshold_pct" numeric, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_underperforming_rooms"("p_start_date" "date", "p_end_date" "date", "p_location" "text", "p_threshold_pct" numeric, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_display_name"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_transaction_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_transaction_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_transaction_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_activity"("p_action" "text", "p_details" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_activity"("p_action" "text", "p_details" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_activity"("p_action" "text", "p_details" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_checkin"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_checkin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_checkin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_request_response"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_request_response"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_request_response"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_fee_items"("p_marketing_name" "text", "p_transaction_ids" bigint[], "p_proof_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_fee_items"("p_marketing_name" "text", "p_transaction_ids" bigint[], "p_proof_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_fee_items"("p_marketing_name" "text", "p_transaction_ids" bigint[], "p_proof_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_fee_items"("p_marketing_name" "text", "p_transaction_ids" bigint[], "p_proof_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_tagihan_bulanan"("p_tagihan_id" bigint, "p_proof_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_tagihan_bulanan"("p_tagihan_id" bigint, "p_proof_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_tagihan_bulanan"("p_tagihan_id" bigint, "p_proof_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_tagihan_bulanan"("p_tagihan_id" bigint, "p_proof_url" "text") TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_transaction_by_privileged_role"("p_transaction_id" bigint, "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_transaction_by_privileged_role"("p_transaction_id" bigint, "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_transaction_by_privileged_role"("p_transaction_id" bigint, "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_transaction_by_privileged_role"("p_transaction_id" bigint, "p_payload" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activity_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."activity_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."activity_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."karyawan_list" TO "anon";
GRANT ALL ON TABLE "public"."karyawan_list" TO "authenticated";
GRANT ALL ON TABLE "public"."karyawan_list" TO "service_role";



GRANT ALL ON SEQUENCE "public"."karyawan_list_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."karyawan_list_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."karyawan_list_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lokasi_apartemen" TO "anon";
GRANT ALL ON TABLE "public"."lokasi_apartemen" TO "authenticated";
GRANT ALL ON TABLE "public"."lokasi_apartemen" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lokasi_apartemen_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lokasi_apartemen_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lokasi_apartemen_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_list" TO "anon";
GRANT ALL ON TABLE "public"."marketing_list" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_list" TO "service_role";



GRANT ALL ON SEQUENCE "public"."marketing_list_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."marketing_list_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."marketing_list_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."menu_access_logs" TO "anon";
GRANT ALL ON TABLE "public"."menu_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_access_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."menu_access_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."menu_access_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."menu_access_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."menu_configuration" TO "anon";
GRANT ALL ON TABLE "public"."menu_configuration" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_configuration" TO "service_role";



GRANT ALL ON SEQUENCE "public"."menu_configuration_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."menu_configuration_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."menu_configuration_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."nomor_kamar" TO "anon";
GRANT ALL ON TABLE "public"."nomor_kamar" TO "authenticated";
GRANT ALL ON TABLE "public"."nomor_kamar" TO "service_role";



GRANT ALL ON SEQUENCE "public"."nomor_kamar_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."nomor_kamar_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."nomor_kamar_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notification_hidden" TO "anon";
GRANT ALL ON TABLE "public"."notification_hidden" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_hidden" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."pengeluaran" TO "anon";
GRANT ALL ON TABLE "public"."pengeluaran" TO "authenticated";
GRANT ALL ON TABLE "public"."pengeluaran" TO "service_role";



GRANT ALL ON TABLE "public"."pengeluaran_categories" TO "anon";
GRANT ALL ON TABLE "public"."pengeluaran_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."pengeluaran_categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pengeluaran_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pengeluaran_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pengeluaran_categories_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pengeluaran_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pengeluaran_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pengeluaran_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."requests" TO "anon";
GRANT ALL ON TABLE "public"."requests" TO "authenticated";
GRANT ALL ON TABLE "public"."requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."role_menu_visibility" TO "anon";
GRANT ALL ON TABLE "public"."role_menu_visibility" TO "authenticated";
GRANT ALL ON TABLE "public"."role_menu_visibility" TO "service_role";



GRANT ALL ON SEQUENCE "public"."role_menu_visibility_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."role_menu_visibility_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."role_menu_visibility_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_settings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_settings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_settings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tagihan_bulanan" TO "anon";
GRANT ALL ON TABLE "public"."tagihan_bulanan" TO "authenticated";
GRANT ALL ON TABLE "public"."tagihan_bulanan" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tagihan_bulanan_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tagihan_bulanan_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tagihan_bulanan_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tagihan_fee_lunas" TO "anon";
GRANT ALL ON TABLE "public"."tagihan_fee_lunas" TO "authenticated";
GRANT ALL ON TABLE "public"."tagihan_fee_lunas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tagihan_fee_lunas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tagihan_fee_lunas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tagihan_fee_lunas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tagihan_fee_lunas_items" TO "anon";
GRANT ALL ON TABLE "public"."tagihan_fee_lunas_items" TO "authenticated";
GRANT ALL ON TABLE "public"."tagihan_fee_lunas_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tagihan_fee_lunas_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tagihan_fee_lunas_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tagihan_fee_lunas_items_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_location_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_location_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_location_assignments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_location_assignments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_location_assignments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_location_assignments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_permissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_permissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_permissions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







