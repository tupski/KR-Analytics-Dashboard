-- =============================================================
-- MIGRATION: Tambah kategori pengeluaran baru + update RPC
-- 1. Insert kategori "Fee Marketing" dan "Tagihan Unit"
-- 2. Update pay_fee_items: catat pengeluaran dengan category = 'Fee Marketing'
-- 3. Update pay_tagihan_bulanan: catat pengeluaran dengan category = 'Tagihan Unit'
-- 4. Update get_category_summary: kembalikan raw_category untuk exact-match filter
-- =============================================================

-- 1) Tambah kategori baru (idempotent)
INSERT INTO public.pengeluaran_categories (name)
VALUES ('Fee Marketing'), ('Tagihan Unit')
ON CONFLICT (name) DO NOTHING;

-- 2) Update RPC pay_fee_items: tambah category pada insert pengeluaran
CREATE OR REPLACE FUNCTION public.pay_fee_items(
  p_marketing_name text,
  p_transaction_ids bigint[],
  p_proof_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.pay_fee_items(text, bigint[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_fee_items(text, bigint[], text) TO authenticated;


-- 3) Update RPC pay_tagihan_bulanan: tambah category = 'Tagihan Unit'
CREATE OR REPLACE FUNCTION public.pay_tagihan_bulanan(
  p_tagihan_id bigint,
  p_proof_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_paid_at timestamptz := now();
  v_row public.tagihan_bulanan%ROWTYPE;
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

  UPDATE public.tagihan_bulanan
  SET
    status = 'paid',
    paid_at = v_paid_at,
    proof_url = COALESCE(p_proof_url, proof_url)
  WHERE id = p_tagihan_id;

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

  RETURN jsonb_build_object(
    'tagihan_id', p_tagihan_id,
    'paid_at', v_paid_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_tagihan_bulanan(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_tagihan_bulanan(bigint, text) TO authenticated;


-- 4) Update get_category_summary: kembalikan raw_category untuk exact-match filter di frontend
-- Drop dulu karena return type berubah (tambah kolom raw_category)
DROP FUNCTION IF EXISTS get_category_summary(text, text, date, date);

CREATE OR REPLACE FUNCTION get_category_summary(
  p_lokasi TEXT DEFAULT NULL,
  p_kamar TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  category TEXT,
  raw_category TEXT,
  total_amount NUMERIC,
  transaction_count BIGINT
)
LANGUAGE sql
STABLE
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


-- 5) Perbaiki format keterangan lama "Tagihan lunas pada 2026-05-XX ..."
--    menjadi "Tagihan lunas pada DD Bln YYYY HH:MM WIB"
UPDATE public.pengeluaran
SET keterangan = (
  SELECT format('Tagihan lunas pada %s %s %s %s WIB',
    to_char(ts AT TIME ZONE 'Asia/Jakarta', 'DD'),
    CASE EXTRACT(MONTH FROM ts AT TIME ZONE 'Asia/Jakarta')
      WHEN 1  THEN 'Jan' WHEN 2  THEN 'Feb' WHEN 3  THEN 'Mar'
      WHEN 4  THEN 'Apr' WHEN 5  THEN 'Mei' WHEN 6  THEN 'Jun'
      WHEN 7  THEN 'Jul' WHEN 8  THEN 'Agu' WHEN 9  THEN 'Sep'
      WHEN 10 THEN 'Okt' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Des'
    END,
    to_char(ts AT TIME ZONE 'Asia/Jakarta', 'YYYY'),
    to_char(ts AT TIME ZONE 'Asia/Jakarta', 'HH24:MI')
  )
  FROM (
    SELECT (regexp_match(pengeluaran.keterangan, 'Tagihan lunas pada (.+)'))[1]::timestamptz AS ts
  ) sub
  WHERE sub.ts IS NOT NULL
)
WHERE nama_pengeluaran LIKE 'Bayar Tagihan Unit%'
  AND keterangan LIKE 'Tagihan lunas pada %'
  AND keterangan NOT LIKE '% WIB';
