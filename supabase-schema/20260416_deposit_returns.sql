-- =============================================================
-- MIGRATION: Fitur Pengembalian Deposit
-- Jalankan di: Supabase Dashboard → SQL Editor
-- =============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS deposit_returned_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_refund_proof_url text DEFAULT NULL;

COMMENT ON COLUMN transactions.deposit_returned_at IS 'Waktu kapan deposit dikembalikan ke penyewa';
COMMENT ON COLUMN transactions.deposit_refund_proof_url IS 'URL bukti transfer pengembalian deposit (opsional)';
