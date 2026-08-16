-- ============================================================
-- KR Analytics — Local PostgreSQL Migration 008
-- Add last_full_rescan_at to sync_metadata
--
-- Tracks the last full re-scan (daily backstop) for the
-- window-reduction incremental sync fallback. Production tables
-- have NO updated_at column/trigger yet, so a narrow re-scan
-- window can miss edits/deletes; a daily full re-scan guarantees
-- eventual consistency. This column records when it last ran.
-- ============================================================

ALTER TABLE sync_metadata
    ADD COLUMN IF NOT EXISTS last_full_rescan_at TIMESTAMPTZ;
