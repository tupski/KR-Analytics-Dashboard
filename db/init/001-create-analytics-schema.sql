-- ============================================================
-- KR Analytics — Local PostgreSQL Schema Init
-- Auto-runs on first container start via docker-entrypoint-initdb.d
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Sync Metadata ───
CREATE TABLE sync_metadata (
    table_name       VARCHAR(100) PRIMARY KEY,
    last_sync_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_max_id      BIGINT,
    row_count        BIGINT DEFAULT 0,
    sync_status      VARCHAR(20) DEFAULT 'idle',
    error_message    TEXT,
    backfill_done    BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sync Logs ───
CREATE TABLE sync_logs (
    id              BIGSERIAL PRIMARY KEY,
    table_name      VARCHAR(100) NOT NULL,
    sync_type       VARCHAR(20) NOT NULL,  -- 'full', 'incremental', 'summary'
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'running',  -- running, success, error
    rows_synced     INTEGER DEFAULT 0,
    rows_deleted    INTEGER DEFAULT 0,
    error_message   TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_table_name ON sync_logs (table_name);
CREATE INDEX idx_sync_logs_started_at ON sync_logs (started_at);
CREATE INDEX idx_sync_logs_status ON sync_logs (status);

-- ─── Mirror: transactions ───
CREATE TABLE transactions (
    id                   INTEGER PRIMARY KEY,
    customer_name        VARCHAR(255) NOT NULL,
    marketing_name       VARCHAR(255) NOT NULL,
    rental_duration      INTEGER NOT NULL,
    shift                VARCHAR(50),
    input_by             VARCHAR(255) NOT NULL,
    apartment_location   VARCHAR(255) NOT NULL,
    room_number          VARCHAR(255) NOT NULL,
    cash_amount          NUMERIC(15,2) DEFAULT 0,
    transfer_amount      NUMERIC(15,2) DEFAULT 0,
    transfer_to          VARCHAR(255),
    marketing_fee        NUMERIC(15,2) DEFAULT 0,
    ktp_image_url        TEXT,
    transfer_proof_url   TEXT,
    user_id              UUID,
    created_at           TIMESTAMPTZ NOT NULL,
    checkout_at          TIMESTAMPTZ,
    deposit_cash         NUMERIC(12,2) DEFAULT 0,
    deposit_transfer     NUMERIC(12,2) DEFAULT 0,
    deposit_returned_at  TIMESTAMPTZ,
    deposit_refund_proof_url TEXT,
    checkin_at           TIMESTAMPTZ,
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted           BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_transactions_checkin_at ON transactions (checkin_at);
CREATE INDEX idx_transactions_checkout_at ON transactions (checkout_at);
CREATE INDEX idx_transactions_location ON transactions (apartment_location);
CREATE INDEX idx_transactions_room ON transactions (room_number);
CREATE INDEX idx_transactions_location_room ON transactions (apartment_location, room_number);
CREATE INDEX idx_transactions_created_at ON transactions (created_at);
CREATE INDEX idx_transactions_synced_at ON transactions (synced_at);
CREATE INDEX idx_transactions_status ON transactions (checkin_at, checkout_at) WHERE is_deleted = FALSE;
CREATE INDEX idx_transactions_active ON transactions (apartment_location, room_number, checkin_at, checkout_at) WHERE is_deleted = FALSE;

-- ─── Mirror: pengeluaran ───
CREATE TABLE pengeluaran (
    id                   INTEGER PRIMARY KEY,
    nama_pengeluaran     VARCHAR(255) NOT NULL,
    jumlah               NUMERIC(15,2) NOT NULL,
    tanggal              DATE NOT NULL,
    keterangan           TEXT,
    user_id              UUID,
    created_at           TIMESTAMPTZ NOT NULL,
    category             VARCHAR(100),
    apartment_location   VARCHAR(255),
    room_number          VARCHAR(255),
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted           BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_pengeluaran_tanggal ON pengeluaran (tanggal);
CREATE INDEX idx_pengeluaran_category ON pengeluaran (category);
CREATE INDEX idx_pengeluaran_location ON pengeluaran (apartment_location);
CREATE INDEX idx_pengeluaran_created_at ON pengeluaran (created_at);
CREATE INDEX idx_pengeluaran_synced_at ON pengeluaran (synced_at);

-- ─── Mirror: nomor_kamar ───
CREATE TABLE nomor_kamar (
    id              INTEGER PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    lokasi          VARCHAR(255) NOT NULL,
    status          VARCHAR(50) DEFAULT 'available',
    created_at      TIMESTAMPTZ NOT NULL,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_nomor_kamar_lokasi ON nomor_kamar (lokasi);
CREATE INDEX idx_nomor_kamar_status ON nomor_kamar (status);
CREATE INDEX idx_nomor_kamar_synced_at ON nomor_kamar (synced_at);

-- ─── Mirror: tagihan_bulanan ───
CREATE TABLE tagihan_bulanan (
    id                    INTEGER PRIMARY KEY,
    apartment_location    VARCHAR(255) NOT NULL,
    room_number           VARCHAR(255) NOT NULL,
    amount                NUMERIC(15,2) NOT NULL,
    due_date              DATE NOT NULL,
    status                VARCHAR(50) DEFAULT 'unpaid',
    paid_at               TIMESTAMPTZ,
    proof_url             TEXT,
    user_id               UUID,
    created_at            TIMESTAMPTZ NOT NULL,
    is_recurring          BOOLEAN DEFAULT FALSE NOT NULL,
    recurring_parent_id   BIGINT,
    synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted            BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_tagihan_bulanan_due_date ON tagihan_bulanan (due_date);
CREATE INDEX idx_tagihan_bulanan_status ON tagihan_bulanan (status);
CREATE INDEX idx_tagihan_bulanan_location ON tagihan_bulanan (apartment_location);
CREATE INDEX idx_tagihan_bulanan_created_at ON tagihan_bulanan (created_at);
CREATE INDEX idx_tagihan_bulanan_synced_at ON tagihan_bulanan (synced_at);

-- ─── Mirror: tagihan_fee_lunas_items ───
CREATE TABLE tagihan_fee_lunas_items (
    id              BIGINT PRIMARY KEY,
    transaction_id  BIGINT NOT NULL,
    marketing_name  TEXT NOT NULL,
    fee_amount      NUMERIC(15,2) DEFAULT 0 NOT NULL,
    paid_at         TIMESTAMPTZ NOT NULL,
    paid_date       DATE,
    paid_by         UUID NOT NULL,
    proof_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_fee_items_transaction_id ON tagihan_fee_lunas_items (transaction_id);
CREATE INDEX idx_fee_items_marketing_name ON tagihan_fee_lunas_items (marketing_name);
CREATE INDEX idx_fee_items_paid_date ON tagihan_fee_lunas_items (paid_date);
CREATE INDEX idx_fee_items_created_at ON tagihan_fee_lunas_items (created_at);
CREATE INDEX idx_fee_items_synced_at ON tagihan_fee_lunas_items (synced_at);

-- ─── Mirror: lokasi_apartemen ───
CREATE TABLE lokasi_apartemen (
    id              INTEGER PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    total_rooms     INTEGER DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_lokasi_apartemen_name ON lokasi_apartemen (name);
CREATE INDEX idx_lokasi_apartemen_synced_at ON lokasi_apartemen (synced_at);

-- ─── Mirror: tagihan_fee_lunas ───
CREATE TABLE tagihan_fee_lunas (
    id                      INTEGER PRIMARY KEY,
    marketing_name          VARCHAR(255) NOT NULL,
    customer_count          INTEGER NOT NULL,
    total_fee               NUMERIC(15,2) NOT NULL,
    transactions_detail     JSONB,
    proof_url               TEXT,
    paid_at                 TIMESTAMPTZ NOT NULL,
    user_id                 UUID,
    created_at              TIMESTAMPTZ NOT NULL,
    paid_date               DATE,
    synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted              BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_fee_lunas_marketing_name ON tagihan_fee_lunas (marketing_name);
CREATE INDEX idx_fee_lunas_paid_date ON tagihan_fee_lunas (paid_date);
CREATE INDEX idx_fee_lunas_synced_at ON tagihan_fee_lunas (synced_at);

-- ─── Mirror: pengeluaran_categories ───
CREATE TABLE pengeluaran_categories (
    id              INTEGER PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_pengeluaran_categories_name ON pengeluaran_categories (name);

-- ─── Mirror: marketing_list ───
CREATE TABLE marketing_list (
    id              INTEGER PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE
);

-- ─── Mirror: karyawan_list ───
CREATE TABLE karyawan_list (
    id              INTEGER PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN DEFAULT FALSE
);

-- ─── Summary: analytics_daily_revenue ───
CREATE TABLE analytics_daily_revenue (
    date_wib                DATE NOT NULL,
    apartment_location      VARCHAR(255) NOT NULL,
    total_revenue           NUMERIC(15,2) NOT NULL DEFAULT 0,
    cash_revenue            NUMERIC(15,2) NOT NULL DEFAULT 0,
    transfer_revenue        NUMERIC(15,2) NOT NULL DEFAULT 0,
    transaction_count       INTEGER NOT NULL DEFAULT 0,
    avg_revenue_per_tx      NUMERIC(15,2) DEFAULT 0,
    unique_rooms            INTEGER DEFAULT 0,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date_wib, apartment_location)
);

CREATE INDEX idx_daily_revenue_date ON analytics_daily_revenue (date_wib);
CREATE INDEX idx_daily_revenue_location ON analytics_daily_revenue (apartment_location);

-- ─── Summary: analytics_monthly_summary ───
CREATE TABLE analytics_monthly_summary (
    year                    INTEGER NOT NULL,
    month                   INTEGER NOT NULL,
    apartment_location      VARCHAR(255) NOT NULL,
    total_revenue           NUMERIC(15,2) DEFAULT 0,
    cash_revenue            NUMERIC(15,2) DEFAULT 0,
    transfer_revenue        NUMERIC(15,2) DEFAULT 0,
    transaction_count       INTEGER DEFAULT 0,
    total_expenses          NUMERIC(15,2) DEFAULT 0,
    expense_count           INTEGER DEFAULT 0,
    net_profit              NUMERIC(15,2) DEFAULT 0,
    avg_daily_occupancy     NUMERIC(5,2) DEFAULT 0,
    occupied_room_days      INTEGER DEFAULT 0,
    total_possible_room_days INTEGER DEFAULT 0,
    paid_bills_count        INTEGER DEFAULT 0,
    unpaid_bills_count      INTEGER DEFAULT 0,
    paid_bills_amount       NUMERIC(15,2) DEFAULT 0,
    unpaid_bills_amount     NUMERIC(15,2) DEFAULT 0,
    total_marketing_fees    NUMERIC(15,2) DEFAULT 0,
    paid_fees_amount        NUMERIC(15,2) DEFAULT 0,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (year, month, apartment_location)
);

CREATE INDEX idx_monthly_summary_year_month ON analytics_monthly_summary (year, month);

-- ─── Summary: analytics_occupancy_daily ───
CREATE TABLE analytics_occupancy_daily (
    date_wib                DATE NOT NULL,
    apartment_location      VARCHAR(255) NOT NULL,
    room_number             VARCHAR(255) NOT NULL,
    is_occupied             BOOLEAN NOT NULL DEFAULT FALSE,
    transaction_id          INTEGER,
    customer_name           VARCHAR(255),
    checkin_at              TIMESTAMPTZ,
    checkout_at             TIMESTAMPTZ,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date_wib, apartment_location, room_number)
);

CREATE INDEX idx_occupancy_daily_date ON analytics_occupancy_daily (date_wib);
CREATE INDEX idx_occupancy_daily_location ON analytics_occupancy_daily (apartment_location);
CREATE INDEX idx_occupancy_daily_room ON analytics_occupancy_daily (apartment_location, room_number);
CREATE INDEX idx_occupancy_daily_occupied ON analytics_occupancy_daily (date_wib, is_occupied);

-- ─── Summary: analytics_expense_summary ───
CREATE TABLE analytics_expense_summary (
    date_wib                DATE NOT NULL,
    apartment_location      VARCHAR(255) NOT NULL,
    category                VARCHAR(100) NOT NULL DEFAULT 'Lainnya',
    total_amount            NUMERIC(15,2) NOT NULL DEFAULT 0,
    expense_count           INTEGER NOT NULL DEFAULT 0,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date_wib, apartment_location, category)
);

CREATE INDEX idx_expense_summary_date ON analytics_expense_summary (date_wib);
CREATE INDEX idx_expense_summary_location ON analytics_expense_summary (apartment_location);
CREATE INDEX idx_expense_summary_category ON analytics_expense_summary (category);

-- Add summary tracking fields to sync_metadata (if not exist)
-- These are added idempotently via DO block
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_metadata' AND column_name = 'summary_refresh_range_start') THEN
        ALTER TABLE sync_metadata ADD COLUMN summary_refresh_range_start TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_metadata' AND column_name = 'summary_last_refresh_at') THEN
        ALTER TABLE sync_metadata ADD COLUMN summary_last_refresh_at TIMESTAMPTZ;
    END IF;
END $$;

-- ─── Seed sync_metadata ───
INSERT INTO sync_metadata (table_name) VALUES
    ('transactions'),
    ('pengeluaran'),
    ('nomor_kamar'),
    ('tagihan_bulanan'),
    ('tagihan_fee_lunas_items'),
    ('lokasi_apartemen'),
    ('tagihan_fee_lunas'),
    ('pengeluaran_categories'),
    ('marketing_list'),
    ('karyawan_list'),
    ('analytics_daily_revenue'),
    ('analytics_monthly_summary'),
    ('analytics_occupancy_daily'),
    ('analytics_expense_summary')
ON CONFLICT (table_name) DO NOTHING;

-- ============================================================
-- AI Provider Models Table (for AI chat functionality)
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
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_provider" ON "public"."ai_provider_models" ("provider_slug");

-- Index for filtering enabled models (idempotent)
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_enabled" ON "public"."ai_provider_models" ("enabled");

-- Index for sorting by last fetch time (idempotent)
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_last_fetched" ON "public"."ai_provider_models" ("last_fetched_at" DESC);

-- Composite index for common query pattern (provider + enabled) (idempotent)
CREATE INDEX IF NOT EXISTS "idx_ai_provider_models_provider_enabled" ON "public"."ai_provider_models" ("provider_slug", "enabled");
