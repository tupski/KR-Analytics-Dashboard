-- ============================================================
-- Fix: Replace expression-based UNIQUE INDEX with proper
-- UNIQUE CONSTRAINT that ON CONFLICT ON CONSTRAINT can target.
--
-- PG 16 supports NULLS NOT DISTINCT, eliminating the need
-- for COALESCE() expressions in the unique definition.
-- ============================================================

-- 1. Drop the old expression-based unique index
DROP INDEX IF EXISTS idx_cache_mart_upsert;

-- 2. Add a real unique constraint (PG16 NULLS NOT DISTINCT)
--    This allows ON CONFLICT ON CONSTRAINT to work properly.
ALTER TABLE analytics_cache_mart
    ADD CONSTRAINT idx_cache_mart_upsert
    UNIQUE NULLS NOT DISTINCT (mart_name, metric_name, range_start, range_end, location, unit_id);
