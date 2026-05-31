-- ============================================================
-- AI Provider Models Table
-- ============================================================
-- Stores AI models fetched from various provider APIs
-- (OpenAI, Anthropic, Google, etc.)
--
-- This table is populated by server-side fetching jobs and
-- provides a centralized registry of available models with
-- their capabilities, pricing, and metadata.
--
-- Access Control:
--   - Authenticated users: READ only
--   - Service role: Full CRUD (for fetching jobs)
-- ============================================================

-- Create the ai_provider_models table
CREATE TABLE IF NOT EXISTS "public"."ai_provider_models" (
    "id"              BIGSERIAL PRIMARY KEY,
    "provider_slug"   TEXT NOT NULL,                          -- e.g., 'openai', 'anthropic', 'google'
    "provider_name"   TEXT NOT NULL,                          -- e.g., 'OpenAI', 'Anthropic', 'Google'
    "model_id"        TEXT NOT NULL,                          -- e.g., 'gpt-4', 'claude-3-opus-20240229'
    "display_name"    TEXT NOT NULL,                          -- Human-readable name for UI
    "enabled"         BOOLEAN NOT NULL DEFAULT true,          -- Whether model is available for use
    "capabilities"    JSONB NULL,                             -- Model capabilities (vision, tools, etc.)
    "pricing"         JSONB NULL,                             -- Pricing info (input/output tokens)
    "raw"             JSONB NULL,                             -- Raw API response for reference
    "last_fetched_at" TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT "ai_provider_models_provider_model_unique" UNIQUE("provider_slug", "model_id")
);

-- Table and column comments for documentation
COMMENT ON TABLE "public"."ai_provider_models" IS
    'Registry of AI models fetched from provider APIs. Populated by server-side jobs.';

COMMENT ON COLUMN "public"."ai_provider_models"."provider_slug" IS
    'Unique identifier for the provider (e.g., openai, anthropic, google)';

COMMENT ON COLUMN "public"."ai_provider_models"."model_id" IS
    'Provider-specific model identifier (e.g., gpt-4, claude-3-opus-20240229)';

COMMENT ON COLUMN "public"."ai_provider_models"."capabilities" IS
    'JSONB object containing model capabilities: {vision: boolean, tools: boolean, maxTokens: number, etc.}';

COMMENT ON COLUMN "public"."ai_provider_models"."pricing" IS
    'JSONB object containing pricing info: {inputTokens: number, outputTokens: number, currency: string}';

COMMENT ON COLUMN "public"."ai_provider_models"."raw" IS
    'Raw API response from provider for debugging and future reference';

-- Auto-update updated_at trigger function (reuse if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
    ) THEN
        CREATE OR REPLACE FUNCTION "public"."set_updated_at"()
        RETURNS trigger LANGUAGE plpgsql AS $func$
        BEGIN
            NEW.updated_at = timezone('utc', now());
            RETURN NEW;
        END;
        $func$;
    END IF;
END
$$;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS "ai_provider_models_updated_at" ON "public"."ai_provider_models";
CREATE TRIGGER "ai_provider_models_updated_at"
    BEFORE UPDATE ON "public"."ai_provider_models"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- ============================================================
-- Indexes for Performance
-- ============================================================

-- Index for filtering by provider
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_provider"
    ON "public"."ai_provider_models" ("provider_slug");

-- Index for filtering enabled models
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_enabled"
    ON "public"."ai_provider_models" ("enabled");

-- Index for sorting by last fetch time
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_last_fetched"
    ON "public"."ai_provider_models" ("last_fetched_at" DESC);

-- Composite index for common query pattern (provider + enabled)
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_provider_enabled"
    ON "public"."ai_provider_models" ("provider_slug", "enabled");

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on the table
ALTER TABLE "public"."ai_provider_models" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all models
-- This enables the UI to display available models to logged-in users
CREATE POLICY "ai_provider_models_select_authenticated"
    ON "public"."ai_provider_models"
    FOR SELECT
    TO authenticated
    USING (true);

-- Note: No INSERT, UPDATE, or DELETE policies for authenticated users.
-- Only the service_role can modify this table (service_role bypasses RLS).
-- This ensures model data is only updated by server-side fetching jobs.

-- ============================================================
-- Migration Notes
-- ============================================================
-- 
-- This migration creates the foundation for the AI model fetching
-- feature. The table will be populated by server-side jobs that
-- periodically fetch model lists from provider APIs.
--
-- To rollback this migration:
--   DROP TABLE IF EXISTS "public"."ai_provider_models" CASCADE;
--
-- ============================================================
