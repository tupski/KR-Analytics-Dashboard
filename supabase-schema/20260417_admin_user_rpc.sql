-- Ensure pgcrypto is enabled for gen_salt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- MIGRATION: Super Admin Management RPCs
-- =============================================================

-- 1) RPC: Tambah User Baru (Auth + Role + Profile)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text,
  p_gender text,
  p_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Cek apakah pemanggil adalah super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat menambah user.';
  END IF;

  -- 1) Create auth user
  -- Catatan: Password di-hash menggunakan pgcrypto (pastikan extension terinstall)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, 
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
    is_super_admin, created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', p_full_name),
    false,
    now(),
    now()
  )
  RETURNING id INTO v_user_id;

  -- 2) Role (Tabel user_roles)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- 3) Profile (Tabel user_profiles)
  INSERT INTO public.user_profiles (id, email, full_name, phone, gender, role)
  VALUES (v_user_id, p_email, p_full_name, p_phone, p_gender, p_role)
  ON CONFLICT (id) DO UPDATE SET 
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    gender = EXCLUDED.gender,
    role = EXCLUDED.role;

  RETURN v_user_id;
END;
$$;

-- 2) RPC: Hapus User (Profile + Role + Auth)
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Cek apakah pemanggil adalah super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat menghapus user.';
  END IF;

  -- Jangan hapus diri sendiri
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak dapat menghapus akun Anda sendiri.';
  END IF;

  -- Hapus dari auth.users (Cascade akan menghapus profile & roles jika foreign key diset cascade)
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN true;
END;
$$;

-- 3) RPC: Update User (Profile + Role)
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
  -- Cek apakah pemanggil adalah super_admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Super Admin yang dapat mengubah user.';
  END IF;

  -- Update Profile
  UPDATE public.user_profiles
  SET 
    full_name = p_full_name,
    phone = p_phone,
    gender = p_gender,
    role = p_role,
    updated_at = now()
  WHERE id = p_target_user_id;

  -- Update Role
  UPDATE public.user_roles
  SET role = p_role
  WHERE user_id = p_target_user_id;

  RETURN true;
END;
$$;

-- Hak akses eksekusi
REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_user(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, text, text) TO authenticated;
