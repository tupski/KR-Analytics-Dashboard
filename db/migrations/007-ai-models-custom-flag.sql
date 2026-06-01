-- ============================================================
-- KR Analytics — Local PostgreSQL Migration 007
-- Add is_custom and is_active columns to ai_provider_models
-- Allows distinguishing user-added custom models vs API-fetched
-- ============================================================

-- Add is_custom flag: true = user-added, false = fetched from provider API
ALTER TABLE "public"."ai_provider_models"
    ADD COLUMN IF NOT EXISTS "is_custom"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "is_active"  BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "public"."ai_provider_models"."is_custom" IS
    'True if this model was added manually by the user (not fetched from provider API)';

COMMENT ON COLUMN "public"."ai_provider_models"."is_active" IS
    'True if this model is currently active/visible in the UI';

-- Index for filtering custom vs fetched models (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_ai_provider_models_is_custom') THEN
        CREATE INDEX "idx_ai_provider_models_is_custom" ON "public"."ai_provider_models" ("is_custom");
    END IF;
END $$;

-- Composite index for filtering by provider + custom status (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_ai_provider_models_provider_custom') THEN
        CREATE INDEX "idx_ai_provider_models_provider_custom" ON "public"."ai_provider_models" ("provider_slug", "is_custom");
    END IF;
END $$;
