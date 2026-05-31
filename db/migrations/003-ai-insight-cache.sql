-- 003-ai-insight-cache.sql
-- Cache table for AI-generated insights
-- Allows server-side caching with TTL, indexed by cache_key for fast lookup

CREATE TABLE IF NOT EXISTS ai_insight_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  page TEXT NOT NULL,
  provider_slug TEXT,
  model_id TEXT,
  report_period_mode TEXT,
  range_start TIMESTAMPTZ,
  range_end TIMESTAMPTZ,
  comparison_start TIMESTAMPTZ,
  comparison_end TIMESTAMPTZ,
  input_hash TEXT,
  response JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_insight_cache_key ON ai_insight_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_insight_cache_expires ON ai_insight_cache(expires_at);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_ai_insight_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_ai_insight_cache_updated_at'
  ) THEN
    CREATE TRIGGER set_ai_insight_cache_updated_at
      BEFORE UPDATE ON ai_insight_cache
      FOR EACH ROW
      EXECUTE FUNCTION update_ai_insight_cache_updated_at();
  END IF;
END;
$$;
