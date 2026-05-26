-- ============================================================
-- Global AI Configuration Table
-- ============================================================
-- Stores AI provider configs (API keys encrypted at app layer)
-- as a SINGLE GLOBAL ROW (scope = 'global').
--
-- Encryption: API keys are AES-256-GCM encrypted by the Next.js
-- server before INSERT/UPDATE using AI_ENCRYPTION_KEY from .env.
-- The DB only stores ciphertext — plaintext never touches the DB.
--
-- No RLS needed for global config (service role only).
-- ============================================================

-- Enable pgcrypto if not already enabled (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AI provider configs (one row per provider, scope always = 'global')
CREATE TABLE IF NOT EXISTS "public"."ai_provider_configs" (
    "id"              uuid DEFAULT gen_random_uuid() NOT NULL,
    "scope"           text NOT NULL DEFAULT 'global',
    "provider_id"     text NOT NULL,               -- e.g. 'deepseek', 'openai', 'gemini'
    "api_key_enc"     text NOT NULL,               -- AES-256-GCM encrypted, base64
    "api_key_iv"      text NOT NULL,               -- GCM IV, base64
    "model"           text,                        -- selected model id
    "base_url"        text,                        -- optional custom endpoint
    "is_active"       boolean NOT NULL DEFAULT false,
    "active_model"    text,                        -- active model override
    "thinking_mode"   text NOT NULL DEFAULT 'auto', -- 'auto' | 'instant' | 'thinking'
    "created_at"      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    "updated_at"      timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_provider_configs_provider_unique" UNIQUE ("scope", "provider_id")
);

COMMENT ON TABLE "public"."ai_provider_configs" IS
    'Global AI provider configurations. API keys are AES-256-GCM encrypted before storage.';

COMMENT ON COLUMN "public"."ai_provider_configs"."api_key_enc" IS
    'AES-256-GCM ciphertext of the API key, base64-encoded.';

COMMENT ON COLUMN "public"."ai_provider_configs"."api_key_iv" IS
    'Random GCM initialization vector used for encryption, base64-encoded.';

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION "public"."set_updated_at"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ai_provider_configs_updated_at" ON "public"."ai_provider_configs";
CREATE TRIGGER "ai_provider_configs_updated_at"
    BEFORE UPDATE ON "public"."ai_provider_configs"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- RLS: Disable (service role only — no user-level row security needed for global config)
ALTER TABLE "public"."ai_provider_configs" DISABLE ROW LEVEL SECURITY;

-- Index for fast lookup by provider
CREATE INDEX IF NOT EXISTS "ai_provider_configs_provider_idx"
    ON "public"."ai_provider_configs" ("provider_id");
