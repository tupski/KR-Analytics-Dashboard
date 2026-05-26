-- ============================================================
-- Krai Chat History Table
-- ============================================================
-- Stores conversation history globally (scope = 'global').
-- Messages stored as JSONB array.
-- Auto-cleanup via retention_days in krai_settings.
-- ============================================================

-- Chat conversations
CREATE TABLE IF NOT EXISTS "public"."krai_conversations" (
    "id"         text NOT NULL,                          -- client-generated random id
    "scope"      text NOT NULL DEFAULT 'global',
    "title"      text NOT NULL DEFAULT 'Percakapan baru',
    "messages"   jsonb NOT NULL DEFAULT '[]'::jsonb,     -- array of ChatMessage objects
    "created_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
    "updated_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT "krai_conversations_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "public"."krai_conversations" IS
    'Krai AI chat history. One row per conversation.';

COMMENT ON COLUMN "public"."krai_conversations"."messages" IS
    'Array of {role, content, timestamp, model, provider} objects.';

-- Auto-update updated_at (reuse trigger function if already created)
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

DROP TRIGGER IF EXISTS "krai_conversations_updated_at" ON "public"."krai_conversations";
CREATE TRIGGER "krai_conversations_updated_at"
    BEFORE UPDATE ON "public"."krai_conversations"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- Index for listing by updated_at desc
CREATE INDEX IF NOT EXISTS "krai_conversations_updated_at_idx"
    ON "public"."krai_conversations" ("updated_at" DESC);

-- Krai settings (global key-value)
CREATE TABLE IF NOT EXISTS "public"."krai_settings" (
    "key"        text NOT NULL,
    "value"      jsonb NOT NULL DEFAULT '{}'::jsonb,
    "updated_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT "krai_settings_pkey" PRIMARY KEY ("key")
);

COMMENT ON TABLE "public"."krai_settings" IS
    'Global settings for Krai AI (e.g., chat_retention_days).';

-- Seed default settings
INSERT INTO "public"."krai_settings" ("key", "value")
VALUES
    ('chat_retention_days', '30'::jsonb),
    ('max_conversations',   '100'::jsonb)
ON CONFLICT ("key") DO NOTHING;

-- No RLS — service role access only
ALTER TABLE "public"."krai_conversations" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."krai_settings"      DISABLE ROW LEVEL SECURITY;
