-- =============================================================
-- MIGRATION: Deposit fields + Fix admin edit RLS
-- Jalankan di: Supabase Dashboard → SQL Editor
-- =============================================================

-- 1. Tambah kolom deposit ke tabel transactions
-- -------------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS deposit_cash     numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_transfer numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN transactions.deposit_cash     IS 'Deposit tunai customer — TIDAK masuk omset';
COMMENT ON COLUMN transactions.deposit_transfer IS 'Deposit transfer customer — TIDAK masuk omset';


-- 2. Izinkan admin & super_admin edit/delete transaksi siapapun
-- -------------------------------------------------------------
-- Cek dulu apakah policy sudah ada, lalu drop + recreate
DROP POLICY IF EXISTS "admin_can_update_any_transaction"  ON transactions;
DROP POLICY IF EXISTS "admin_can_delete_any_transaction"  ON transactions;
DROP POLICY IF EXISTS "admin_can_select_all_transactions" ON transactions;

-- SELECT: admin bisa lihat semua transaksi
CREATE POLICY "admin_can_select_all_transactions" ON transactions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- UPDATE: admin bisa edit semua transaksi
CREATE POLICY "admin_can_update_any_transaction" ON transactions
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- DELETE: admin bisa hapus semua transaksi
CREATE POLICY "admin_can_delete_any_transaction" ON transactions
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- 3. Pastikan INSERT tetap hanya untuk user sendiri (tidak berubah)
-- -------------------------------------------------------------
-- (Jika sudah ada policy INSERT yang benar, lewati bagian ini)
-- DROP POLICY IF EXISTS "users_can_insert_own_transaction" ON transactions;
-- CREATE POLICY "users_can_insert_own_transaction" ON transactions
--   FOR INSERT WITH CHECK (auth.uid() = user_id);
