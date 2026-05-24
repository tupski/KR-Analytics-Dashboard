-- =============================================================
-- MIGRATION: Pembayaran fee marketing per transaksi (parsial)
-- Tujuan:
-- - Mendukung bayar fee per-customer/per-transaksi tanpa menghilangkan sisa tagihan
-- - Menghindari bug timezone harian dengan paid_date berbasis WIB
-- Jalankan di: Supabase Dashboard → SQL Editor
-- =============================================================

-- 1) Tambah kolom paid_date (WIB) untuk riwayat lama tagihan_fee_lunas
--    paid_at tetap dipertahankan sebagai timestamp real pembayaran.
ALTER TABLE public.tagihan_fee_lunas
  ADD COLUMN IF NOT EXISTS paid_date date
    GENERATED ALWAYS AS ((paid_at AT TIME ZONE 'Asia/Jakarta')::date) STORED;

CREATE INDEX IF NOT EXISTS idx_tagihan_fee_lunas_paid_date
  ON public.tagihan_fee_lunas (paid_date);


-- 2) Tabel item pembayaran fee per transaksi
CREATE TABLE IF NOT EXISTS public.tagihan_fee_lunas_items (
  id bigserial PRIMARY KEY,
  transaction_id bigint NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  marketing_name text NOT NULL,
  fee_amount numeric(15,2) NOT NULL DEFAULT 0,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_date date GENERATED ALWAYS AS ((paid_at AT TIME ZONE 'Asia/Jakarta')::date) STORED,
  paid_by uuid NOT NULL REFERENCES auth.users(id),
  proof_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_tagihan_fee_lunas_items_paid_date_marketing
  ON public.tagihan_fee_lunas_items (paid_date, marketing_name);

CREATE INDEX IF NOT EXISTS idx_tagihan_fee_lunas_items_marketing_paid_date
  ON public.tagihan_fee_lunas_items (marketing_name, paid_date);


-- 3) RLS + policies
ALTER TABLE public.tagihan_fee_lunas_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.tagihan_fee_lunas_items;
CREATE POLICY "Enable read access for authenticated users" ON public.tagihan_fee_lunas_items
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.tagihan_fee_lunas_items;
CREATE POLICY "Enable insert for authenticated users" ON public.tagihan_fee_lunas_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = paid_by);

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.tagihan_fee_lunas_items;
CREATE POLICY "Enable update for authenticated users" ON public.tagihan_fee_lunas_items
  FOR UPDATE USING (auth.role() = 'authenticated' AND auth.uid() = paid_by)
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = paid_by);

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.tagihan_fee_lunas_items;
CREATE POLICY "Enable delete for authenticated users" ON public.tagihan_fee_lunas_items
  FOR DELETE USING (auth.role() = 'authenticated' AND auth.uid() = paid_by);

