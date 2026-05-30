-- ============================================================
-- Migration: Add report_period_mode to app_settings
-- 
-- This setting controls how the system calculates daily report
-- periods. See lib/reporting-period.ts for the implementation.
-- 
-- Values:
--   'calendar_day' — 00:00–23:59 WIB (default)
--   'hotel_day'    — 12:00 WIB today – 11:59 WIB next day
-- ============================================================

INSERT INTO app_settings ("key", "value")
VALUES ('report_period_mode', 'calendar_day')
ON CONFLICT ("key") DO NOTHING;
