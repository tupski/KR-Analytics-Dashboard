-- =============================================================
-- Perbaikan admin_update_user: upsert user_roles agar role
-- tetap konsisten bila baris user_roles belum ada (user lama).
-- =============================================================

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_target_user_id uuid,
  p_full_name text,
  p_phone text,
  p_gender text,
  p_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat mengubah user.';
  END IF;

  UPDATE public.user_profiles
  SET
    full_name = p_full_name,
    phone = p_phone,
    gender = p_gender,
    role = p_role,
    updated_at = now()
  WHERE id = p_target_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_target_user_id, p_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, text, text) TO authenticated;
