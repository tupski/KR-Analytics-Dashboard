-- ============================================================
-- KR Analytics — Local PostgreSQL Migration 002
-- AI Provider Models Table
-- Idempotent schema initialization (safe for repeated runs)
-- NO DROP, NO TRUNCATE, NO DELETE — guaranteed safe.
-- ============================================================

-- Create the ai_provider_models table
CREATE TABLE IF NOT EXISTS "public"."ai_provider_models" (
    "id"              BIGSERIAL PRIMARY KEY,
    "provider_slug"   TEXT NOT NULL,
    "provider_name"   TEXT NOT NULL,
    "model_id"        TEXT NOT NULL,
    "display_name"    TEXT NOT NULL,
    "enabled"         BOOLEAN NOT NULL DEFAULT true,
    "capabilities"    JSONB NULL,
    "pricing"         JSONB NULL,
    "raw"             JSONB NULL,
    "last_fetched_at" TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT "ai_provider_models_provider_model_unique" UNIQUE("provider_slug", "model_id")
);

-- Add comments for documentation
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

-- Auto-update updated_at trigger function (idempotent)
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

-- Create trigger for auto-updating updated_at (idempotent)
DROP TRIGGER IF EXISTS "ai_provider_models_updated_at" ON "public"."ai_provider_models";
CREATE TRIGGER "ai_provider_models_updated_at"
    BEFORE UPDATE ON "public"."ai_provider_models"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- Index for filtering by provider (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_ai_provider_models_provider') THEN
        CREATE INDEX "idx_ai_provider_models_provider" ON "public"."ai_provider_models" ("provider_slug");
    END IF;
END $$;

-- Index for filtering enabled models (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_ai_provider_models_enabled') THEN
        CREATE INDEX "idx_ai_provider_models_enabled" ON "public"."ai_provider_models" ("enabled");
    END IF;
END $$;

-- Index for sorting by last fetch time (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_ai_provider_models_last_fetched') THEN
        CREATE INDEX "idx_ai_provider_models_last_fetched" ON "public"."ai_provider_models" ("last_fetched_at" DESC);
    END IF;
END $$;

-- Composite index for common query pattern (provider + enabled) (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_ai_provider_models_provider_enabled') THEN
        CREATE INDEX "idx_ai_provider_models_provider_enabled" ON "public"."ai_provider_models" ("provider_slug", "enabled");
    END IF;
END $$;
