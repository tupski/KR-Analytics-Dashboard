-- =============================================================
-- MIGRATION: RPC atomic untuk operasi keuangan
-- - pay_fee_items: insert paid items + insert pengeluaran dalam 1 transaksi
-- - pay_tagihan_bulanan: update tagihan + insert pengeluaran dalam 1 transaksi
-- =============================================================

-- 1) RPC: bayar fee marketing untuk sekumpulan transaction_id
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

  -- Catat ke pengeluaran hanya jika ada nominal (pakai total fee aktual)
  IF v_total_fee > 0 THEN
    INSERT INTO public.pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, user_id)
    VALUES (
      format('Bayar Fee Marketing %s', p_marketing_name),
      v_total_fee,
      (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
      format('%s customer.', v_items_inserted),
      v_user_id
    );
  END IF;

  -- Simpan “receipt” untuk kompatibilitas history/share (opsional)
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


-- 2) RPC: tandai tagihan bulanan sebagai paid + insert pengeluaran (atomic)
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

  INSERT INTO public.pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, user_id)
  VALUES (
    format('Bayar Tagihan Unit %s - %s', v_row.apartment_location, v_row.room_number),
    v_row.amount,
    (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
    format('Tagihan lunas pada %s', (v_paid_at AT TIME ZONE 'Asia/Jakarta')),
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

