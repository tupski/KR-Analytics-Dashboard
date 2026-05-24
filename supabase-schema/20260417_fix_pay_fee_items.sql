-- =============================================================
-- MIGRATION: Fix RPC pay_fee_items
-- Tujuan: 
-- - Mencegah duplikasi perhitungan fee jika transaksi sudah terbayar.
-- - Mencegah baris "kosong" (customer_count=0) di tagihan_fee_lunas.
-- =============================================================

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
  v_actual_transactions JSONB;
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

  -- 1) Dapatkan data transaksi yang BELUM dibayar
  -- Kita filter ID yang belum ada di tagihan_fee_lunas_items
  SELECT 
    COALESCE(sum(t.marketing_fee), 0),
    jsonb_agg(
      jsonb_build_object(
        'transaction_id', t.id,
        'customer', t.customer_name,
        'location', t.apartment_location
      )
    )
  INTO v_total_fee, v_actual_transactions
  FROM public.transactions t
  WHERE t.id = ANY(p_transaction_ids)
    AND t.marketing_name = p_marketing_name
    AND COALESCE(t.marketing_fee, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.tagihan_fee_lunas_items tfli 
      WHERE tfli.transaction_id = t.id
    );

  -- Jika tidak ada transaksi yang perlu dibayar, keluar awal
  IF v_actual_transactions IS NULL OR jsonb_array_length(v_actual_transactions) = 0 THEN
    RETURN jsonb_build_object(
      'items_inserted', 0,
      'total_fee', 0,
      'paid_at', v_paid_at,
      'message', 'Semua transaksi sudah dibayarkan sebelumnya.'
    );
  END IF;

  -- 2) Insert ke tagihan_fee_lunas_items
  INSERT INTO public.tagihan_fee_lunas_items (
    transaction_id, marketing_name, fee_amount, paid_at, paid_by, proof_url
  )
  SELECT
    (item->>'transaction_id')::bigint,
    p_marketing_name,
    (SELECT marketing_fee FROM public.transactions WHERE id = (item->>'transaction_id')::bigint),
    v_paid_at,
    v_user_id,
    p_proof_url
  FROM jsonb_array_elements(v_actual_transactions) AS item
  ON CONFLICT (transaction_id) DO NOTHING;

  GET DIAGNOSTICS v_items_inserted = ROW_COUNT;

  -- Jika setelah insert ternyata 0 (mungkin race condition), jangan lanjut
  IF v_items_inserted = 0 THEN
    RETURN jsonb_build_object(
      'items_inserted', 0,
      'total_fee', 0,
      'paid_at', v_paid_at
    );
  END IF;

  -- 3) Catat ke pengeluaran
  INSERT INTO public.pengeluaran (nama_pengeluaran, jumlah, tanggal, keterangan, user_id)
  VALUES (
    format('Bayar Fee Marketing %s', p_marketing_name),
    v_total_fee,
    (v_paid_at AT TIME ZONE 'Asia/Jakarta')::date,
    format('%s customer.', v_items_inserted),
    v_user_id
  );

  -- 4) Simpan riwayat lunas (hanya jika ada yang berhasil di-insert)
  INSERT INTO public.tagihan_fee_lunas (
    marketing_name, customer_count, total_fee, transactions_detail, proof_url, paid_at, user_id
  )
  VALUES (
    p_marketing_name,
    v_items_inserted,
    v_total_fee,
    v_actual_transactions,
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
