-- =============================================================
-- MIGRATION: Database triggers untuk notifikasi event-based
-- 1. Notifikasi request baru → admin & super_admin
-- 2. Notifikasi respon request (status berubah) → karyawan yang buat request
-- 3. Notifikasi checkin baru → admin & super_admin
-- =============================================================

-- Helper: ambil nama display user dari user_profiles atau auth.users metadata
CREATE OR REPLACE FUNCTION public.get_user_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT full_name FROM public.user_profiles WHERE id = p_user_id),
    (SELECT email FROM auth.users WHERE id = p_user_id),
    'Pengguna'
  );
$$;

-- =============================================================
-- TRIGGER 1: Request baru → notifikasi ke admin & super_admin
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_new_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body  text;
  v_dedupe text;
BEGIN
  v_title := format('📋 Request Baru: %s', NEW.request_type);
  v_body  := format(
    '%s mengajukan request "%s" untuk lokasi %s pada %s.',
    NEW.employee_name,
    NEW.request_type,
    NEW.apartment_location,
    to_char((NEW.desired_date AT TIME ZONE 'Asia/Jakarta'), 'DD Mon YYYY')
  );
  v_dedupe := format('new_request:%s', NEW.id);

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_request', v_title, v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'request_type', NEW.request_type,
      'employee_name', NEW.employee_name,
      'apartment_location', NEW.apartment_location
    ),
    v_dedupe || ':admin', 'admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_request', v_title, v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'request_type', NEW.request_type,
      'employee_name', NEW.employee_name,
      'apartment_location', NEW.apartment_location
    ),
    v_dedupe || ':super_admin', 'super_admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_request ON public.requests;
CREATE TRIGGER trg_notify_new_request
  AFTER INSERT ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_request();


-- =============================================================
-- TRIGGER 2: Status request berubah → notifikasi ke karyawan
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_request_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title    text;
  v_body     text;
  v_dedupe   text;
  v_admin_name text;
  v_status_label text;
BEGIN
  -- Hanya trigger jika status berubah ke Approved atau Rejected
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('Approved', 'Rejected') THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  -- Ambil nama admin yang mengubah (dari current user context)
  -- Karena trigger berjalan dengan SECURITY DEFINER, kita pakai auth.uid()
  v_admin_name := public.get_user_display_name(auth.uid());

  v_status_label := CASE NEW.status WHEN 'Approved' THEN 'disetujui ✅' ELSE 'ditolak ❌' END;

  v_title := format('Request %s', v_status_label);
  v_body  := format(
    'Request "%s" untuk lokasi %s telah %s oleh %s.',
    NEW.request_type,
    NEW.apartment_location,
    v_status_label,
    v_admin_name
  );
  v_dedupe := format('request_response:%s:%s', NEW.id, NEW.status);

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_user_id)
  VALUES (
    'request_response',
    v_title,
    v_body,
    jsonb_build_object(
      'request_id', NEW.id,
      'request_type', NEW.request_type,
      'status', NEW.status,
      'admin_name', v_admin_name
    ),
    v_dedupe,
    NEW.user_id
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_response ON public.requests;
CREATE TRIGGER trg_notify_request_response
  AFTER UPDATE ON public.requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_request_response();


-- =============================================================
-- TRIGGER 3: Checkin baru → notifikasi ke admin & super_admin
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_new_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title  text;
  v_body   text;
  v_dedupe text;
  v_checkin_label text;
  v_duration_label text;
BEGIN
  -- Format waktu checkin WIB
  v_checkin_label := to_char(
    COALESCE(NEW.checkin_at, NEW.created_at) AT TIME ZONE 'Asia/Jakarta',
    'DD Mon YYYY HH24:MI'
  ) || ' WIB';

  -- Format durasi
  v_duration_label := CASE
    WHEN NEW.rental_duration >= 24 THEN format('%s malam', NEW.rental_duration / 24)
    ELSE format('%s jam', NEW.rental_duration)
  END;

  v_title := format('🏠 Check-in Baru: %s', NEW.apartment_location || ' ' || NEW.room_number);
  v_body  := format(
    '%s check-in di %s - %s. Durasi: %s. Check-in: %s. Input oleh: %s.',
    NEW.customer_name,
    NEW.apartment_location,
    NEW.room_number,
    v_duration_label,
    v_checkin_label,
    NEW.input_by
  );
  v_dedupe := format('new_checkin:tx:%s', NEW.id);

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_checkin', v_title, v_body,
    jsonb_build_object(
      'transaction_id', NEW.id,
      'customer_name', NEW.customer_name,
      'apartment_location', NEW.apartment_location,
      'room_number', NEW.room_number,
      'checkin_at', COALESCE(NEW.checkin_at, NEW.created_at),
      'rental_duration', NEW.rental_duration,
      'input_by', NEW.input_by
    ),
    v_dedupe || ':admin', 'admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  INSERT INTO public.notifications (type, title, body, data, dedupe_key, audience_role)
  VALUES ('new_checkin', v_title, v_body,
    jsonb_build_object(
      'transaction_id', NEW.id,
      'customer_name', NEW.customer_name,
      'apartment_location', NEW.apartment_location,
      'room_number', NEW.room_number,
      'checkin_at', COALESCE(NEW.checkin_at, NEW.created_at),
      'rental_duration', NEW.rental_duration,
      'input_by', NEW.input_by
    ),
    v_dedupe || ':super_admin', 'super_admin')
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_checkin ON public.transactions;
CREATE TRIGGER trg_notify_new_checkin
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_checkin();


-- =============================================================
-- Grant execute permissions
-- =============================================================
GRANT EXECUTE ON FUNCTION public.get_user_display_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_request_response() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_checkin() TO authenticated;
