-- =============================================================
-- MIGRATION: User Management & Location Assignment
-- =============================================================

-- 1) Tambah kolom gender ke user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS gender VARCHAR(20);

-- 2) Tabel untuk memetakan karyawan ke lokasi tertentu
CREATE TABLE IF NOT EXISTS public.user_location_assignments (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    location_name VARCHAR(255) NOT NULL REFERENCES public.lokasi_apartemen(name) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(user_id, location_name)
);

-- 3) Enable RLS
ALTER TABLE public.user_location_assignments ENABLE ROW LEVEL SECURITY;

-- 4) Policies
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.user_location_assignments;
CREATE POLICY "Enable read for authenticated users" ON public.user_location_assignments
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable manage for admin/super_admin" ON public.user_location_assignments;
CREATE POLICY "Enable manage for admin/super_admin" ON public.user_location_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin', 'super_admin')
        )
    );
