-- =============================================================
-- MIGRATION: Notifikasi - hide per-user + preferensi push per-user
-- =============================================================

-- 1) Tabel: notification_hidden (hapus = hide per user)
CREATE TABLE IF NOT EXISTS public.notification_hidden (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_hidden_user_id
  ON public.notification_hidden (user_id, hidden_at DESC);

ALTER TABLE public.notification_hidden ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_hidden_select_self" ON public.notification_hidden;
CREATE POLICY "notification_hidden_select_self" ON public.notification_hidden
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_hidden_insert_self" ON public.notification_hidden;
CREATE POLICY "notification_hidden_insert_self" ON public.notification_hidden
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_hidden_delete_self" ON public.notification_hidden;
CREATE POLICY "notification_hidden_delete_self" ON public.notification_hidden
  FOR DELETE USING (auth.uid() = user_id);


-- 2) Tabel: notification_preferences (preferensi push per-user)
-- types_enabled disimpan sebagai JSONB map: { "announcement": true, "checkout_due": false, ... }
-- Aturan: jika key tidak ada => dianggap enabled (forward-compatible).
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  types_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select_self" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select_self" ON public.notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences_upsert_self" ON public.notification_preferences;
CREATE POLICY "notification_preferences_upsert_self" ON public.notification_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences_update_self" ON public.notification_preferences;
CREATE POLICY "notification_preferences_update_self" ON public.notification_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

