-- ============================================================
-- App Settings Table
-- ============================================================
-- Stores application settings (logo, favicon, app name, theme color, etc.)
-- One row per setting key. Scope = 'global'.
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key"        text NOT NULL,
    "value"      text,
    "updated_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

COMMENT ON TABLE "public"."app_settings" IS
    'Global application settings: logo, favicon, app name, theme color, etc.';

-- Default values
INSERT INTO "public"."app_settings" ("key", "value") VALUES
    ('app_name',       'Kakarama Room Analytics'),
    ('app_subtitle',   'Analytics Dashboard'),
    ('logo_url',       ''),
    ('favicon_url',    ''),
    ('primary_color',  '#2563eb'),
    ('sidebar_color',  'blue')
ON CONFLICT ("key") DO NOTHING;

-- No RLS — service role access only
ALTER TABLE "public"."app_settings" DISABLE ROW LEVEL SECURITY;
