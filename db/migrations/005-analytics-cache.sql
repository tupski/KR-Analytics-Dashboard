-- ============================================================
-- KR Analytics — Cache Layer Migration
-- 
-- Tables:
--   1. analytics_query_cache — generic key-value query result cache
--   2. analytics_cache_mart   — pre-computed analytical snapshots
--      (single unified table for all 9 mart types)
--
-- Functions:
--   analytics_upsert_cache()       — idempotent cache entry upsert
--   analytics_upsert_mart()        — idempotent mart entry upsert
--   analytics_invalidate_cache()   — targeted or full cache invalidation
--   analytics_clean_expired()      — remove expired cache entries
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. analytics_query_cache
-- ═══════════════════════════════════════════════════════════════
-- Generic query result cache. Every entry stores:
--   - cache_key:   deterministic MD5 hash (metric_name + sorted params)
--   - metric_name: logical grouping key for targeted invalidation
--   - params:      JSONB of query parameters (for debugging)
--   - result:      JSONB of the cached query result
--   - expires_at:  when this entry is considered stale
--
-- PK: cache_key (unique)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_query_cache (
    id              BIGSERIAL       PRIMARY KEY,
    cache_key       TEXT            NOT NULL,
    metric_name     TEXT            NOT NULL,
    params          JSONB,
    result          JSONB           NOT NULL,
    generated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ     NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_analytics_query_cache_key UNIQUE (cache_key)
);

COMMENT ON TABLE  analytics_query_cache IS
    'Generic query result cache for analytics. Entries expire based on TTL.';
COMMENT ON COLUMN analytics_query_cache.cache_key IS
    'Deterministic MD5: metric_name + sorted JSON.stringify(params)';
COMMENT ON COLUMN analytics_query_cache.metric_name IS
    'Logical grouping key, e.g. revenue_summary, occupancy_rate';
COMMENT ON COLUMN analytics_query_cache.expires_at IS
    'Entries with expires_at > NOW() are considered valid';

CREATE INDEX IF NOT EXISTS idx_query_cache_metric
    ON analytics_query_cache (metric_name);
CREATE INDEX IF NOT EXISTS idx_query_cache_expires
    ON analytics_query_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_query_cache_metric_expires
    ON analytics_query_cache (metric_name, expires_at);

-- ═══════════════════════════════════════════════════════════════
-- 2. analytics_cache_mart
-- ═══════════════════════════════════════════════════════════════
-- Single unified mart table for all 9 pre-computed analytics slices.
-- The mart_name column discriminates the slice type.
--
-- Mart name → original requirement mapping:
--   dashboard_kpi          → analytics_cache_dashboard_kpi
--   occupancy_by_location  → analytics_cache_occupancy_by_location
--   revenue_by_period      → analytics_cache_revenue_by_period
--   expense_breakdown      → analytics_cache_expense_breakdown
--   billing_breakdown      → analytics_cache_billing_breakdown
--   checkin_busy_hours     → analytics_cache_checkin_busy_hours
--   stay_duration          → analytics_cache_stay_duration
--   weekday_weekend        → analytics_cache_weekday_weekend
--   unit_performance       → analytics_cache_unit_performance
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_cache_mart (
    id                  BIGSERIAL       PRIMARY KEY,
    mart_name           TEXT            NOT NULL,
    metric_name         TEXT            NOT NULL,
    range_start         DATE,
    range_end           DATE,
    comparison_start    DATE,
    comparison_end      DATE,
    report_period_mode  TEXT            DEFAULT 'calendar_day',
    location            TEXT,
    category            TEXT,
    unit_id             INTEGER,
    result              JSONB           NOT NULL,
    generated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ     NOT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  analytics_cache_mart IS
    'Pre-computed analytical snapshots (mart). Refreshed by sync-worker.';
COMMENT ON COLUMN analytics_cache_mart.mart_name IS
    'Discriminator: dashboard_kpi, occupancy_by_location, revenue_by_period, etc.';
COMMENT ON COLUMN analytics_cache_mart.metric_name IS
    'Specific metric within the mart, e.g. total_revenue, occupancy_rate';

CREATE INDEX IF NOT EXISTS idx_cache_mart_name
    ON analytics_cache_mart (mart_name);
CREATE INDEX IF NOT EXISTS idx_cache_mart_metric
    ON analytics_cache_mart (metric_name);
CREATE INDEX IF NOT EXISTS idx_cache_mart_expires
    ON analytics_cache_mart (expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_mart_range
    ON analytics_cache_mart (range_start, range_end);
CREATE INDEX IF NOT EXISTS idx_cache_mart_name_metric
    ON analytics_cache_mart (mart_name, metric_name);
CREATE INDEX IF NOT EXISTS idx_cache_mart_location
    ON analytics_cache_mart (location);

-- ═══════════════════════════════════════════════════════════════
-- 3. Functions
-- ═══════════════════════════════════════════════════════════════

-- ── set_updated_at trigger (idempotent, reuses existing if present) ──
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER LANGUAGE plpgsql AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$;
    END IF;
END $$;

-- ── updated_at triggers (idempotent) ──
DROP TRIGGER IF EXISTS trg_query_cache_updated_at ON analytics_query_cache;
CREATE TRIGGER trg_query_cache_updated_at
    BEFORE UPDATE ON analytics_query_cache
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cache_mart_updated_at ON analytics_cache_mart;
CREATE TRIGGER trg_cache_mart_updated_at
    BEFORE UPDATE ON analytics_cache_mart
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- analytics_upsert_cache()
--
-- Idempotently insert or update a query cache entry.
-- If cache_key exists, refreshes result, generated_at, expires_at.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION analytics_upsert_cache(
    p_cache_key     TEXT,
    p_metric_name   TEXT,
    p_params        JSONB DEFAULT NULL,
    p_result        JSONB DEFAULT NULL,
    p_ttl_seconds   INTEGER DEFAULT 300
) RETURNS VOID AS $$
BEGIN
    INSERT INTO analytics_query_cache (cache_key, metric_name, params, result, generated_at, expires_at)
    VALUES (
        p_cache_key,
        p_metric_name,
        p_params,
        p_result,
        NOW(),
        NOW() + (p_ttl_seconds || ' seconds')::INTERVAL
    )
    ON CONFLICT (cache_key) DO UPDATE SET
        result       = EXCLUDED.result,
        params       = COALESCE(EXCLUDED.params, analytics_query_cache.params),
        generated_at = EXCLUDED.generated_at,
        expires_at   = EXCLUDED.expires_at,
        updated_at   = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION analytics_upsert_cache IS
    'Idempotent cache upsert. Creates or refreshes a query cache entry.';

-- ═══════════════════════════════════════════════════════════════
-- analytics_upsert_mart()
--
-- Idempotently insert or update a mart cache entry.
-- Uniqueness is based on (mart_name, metric_name, range_start, range_end, location, unit_id).
-- Requires a unique index on those columns (created below).
-- ═══════════════════════════════════════════════════════════════

-- First create the unique index for upsert target
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_mart_upsert
    ON analytics_cache_mart (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), COALESCE(unit_id, 0));

CREATE OR REPLACE FUNCTION analytics_upsert_mart(
    p_mart_name          TEXT,
    p_metric_name        TEXT,
    p_range_start        DATE DEFAULT NULL,
    p_range_end          DATE DEFAULT NULL,
    p_comparison_start   DATE DEFAULT NULL,
    p_comparison_end     DATE DEFAULT NULL,
    p_report_period_mode TEXT DEFAULT 'calendar_day',
    p_location           TEXT DEFAULT NULL,
    p_category           TEXT DEFAULT NULL,
    p_unit_id            INTEGER DEFAULT NULL,
    p_result             JSONB DEFAULT NULL,
    p_ttl_seconds        INTEGER DEFAULT 300
) RETURNS VOID AS $$
BEGIN
    INSERT INTO analytics_cache_mart (
        mart_name, metric_name,
        range_start, range_end,
        comparison_start, comparison_end,
        report_period_mode,
        location, category, unit_id,
        result, generated_at, expires_at
    ) VALUES (
        p_mart_name, p_metric_name,
        p_range_start, p_range_end,
        p_comparison_start, p_comparison_end,
        p_report_period_mode,
        p_location, p_category, p_unit_id,
        p_result,
        NOW(),
        NOW() + (p_ttl_seconds || ' seconds')::INTERVAL
    )
    ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), COALESCE(unit_id, 0))
    DO UPDATE SET
        comparison_start   = EXCLUDED.comparison_start,
        comparison_end     = EXCLUDED.comparison_end,
        report_period_mode = EXCLUDED.report_period_mode,
        category           = EXCLUDED.category,
        result             = EXCLUDED.result,
        generated_at       = EXCLUDED.generated_at,
        expires_at         = EXCLUDED.expires_at,
        updated_at         = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION analytics_upsert_mart IS
    'Idempotent mart upsert. Creates or refreshes a mart cache entry.';

-- ═══════════════════════════════════════════════════════════════
-- analytics_invalidate_cache()
--
-- Invalidate fresh (not-yet-expired) cache entries.
--   p_metric_name = NULL  → invalidate all query cache
--   p_metric_name = 'xxx' → invalidate only entries with that metric
-- Returns number of rows invalidated.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION analytics_invalidate_cache(
    p_metric_name TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF p_metric_name IS NULL THEN
        DELETE FROM analytics_query_cache WHERE expires_at > NOW();
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    ELSE
        DELETE FROM analytics_query_cache
        WHERE metric_name = p_metric_name AND expires_at > NOW();
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    END IF;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION analytics_invalidate_cache IS
    'Invalidate fresh cache entries. Returns count invalidated.';

-- ═══════════════════════════════════════════════════════════════
-- analytics_clean_expired()
--
-- Remove all expired cache entries (both tables) to reclaim space.
-- Can be called periodically (e.g. daily cron).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION analytics_clean_expired()
RETURNS INTEGER AS $$
DECLARE
    v_total INTEGER;
    v_qc    INTEGER;
    v_mart  INTEGER;
BEGIN
    DELETE FROM analytics_query_cache WHERE expires_at <= NOW();
    GET DIAGNOSTICS v_qc = ROW_COUNT;

    DELETE FROM analytics_cache_mart WHERE expires_at <= NOW();
    GET DIAGNOSTICS v_mart = ROW_COUNT;

    v_total := v_qc + v_mart;
    RETURN v_total;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION analytics_clean_expired IS
    'Remove expired entries from both cache tables. Returns total removed.';

-- ═══════════════════════════════════════════════════════════════
-- 4. Seed initial metadata entries (if not exist)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO sync_metadata (table_name) VALUES
    ('analytics_query_cache'),
    ('analytics_cache_mart')
ON CONFLICT (table_name) DO NOTHING;
