-- Migration: Create RPC function get_category_summary
-- Purpose: Server-side aggregation of expenses by category for PengeluaranUnit_Tab
-- Requirements: 5.1, 5.6
-- Run this in Supabase SQL Editor or via migration

CREATE OR REPLACE FUNCTION get_category_summary(
  p_lokasi TEXT DEFAULT NULL,
  p_kamar TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  category TEXT,
  total_amount NUMERIC,
  transaction_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya') AS category,
    SUM(p.jumlah) AS total_amount,
    COUNT(*) AS transaction_count
  FROM pengeluaran p
  WHERE
    (p_lokasi IS NULL OR p.apartment_location = p_lokasi)
    AND (p_kamar IS NULL OR p.room_number = p_kamar)
    AND (p_start_date IS NULL OR p.tanggal >= p_start_date)
    AND (p_end_date IS NULL OR p.tanggal <= p_end_date)
  GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Lainnya')
  ORDER BY total_amount DESC;
$$;
