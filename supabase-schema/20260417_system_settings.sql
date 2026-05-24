-- Migrasi untuk tabel system_settings (Lebih aman untuk tabel yang sudah ada)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Pastikan kolom description ada jika tabel sudah ada sebelumnya
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='description') THEN
        ALTER TABLE public.system_settings ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='value') THEN
        ALTER TABLE public.system_settings ADD COLUMN value JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_settings' AND column_name='updated_at') THEN
        ALTER TABLE public.system_settings ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());
    END IF;
END $$;

-- Seed awal data jika kosong
INSERT INTO public.system_settings (key, value, description)
VALUES 
    ('app_name', '"Kakarama Room"'::jsonb, 'Nama Aplikasi'),
    ('maintenance_mode', 'false'::jsonb, 'Status Maintenance Mode'),
    ('wa_admin', '"6289613413636"'::jsonb, 'Nomor WhatsApp Admin untuk laporan'),
    ('global_announcement', '""'::jsonb, 'Pengumuman yang muncul di seluruh halaman')
ON CONFLICT (key) DO UPDATE SET
    description = EXCLUDED.description,
    value = COALESCE(public.system_settings.value, EXCLUDED.value); -- Jangan timpa value jika sudah ada

-- RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid errors on re-run
DROP POLICY IF EXISTS "Enable read for all authenticated users" ON public.system_settings;
DROP POLICY IF EXISTS "Enable all for admin/super_admin" ON public.system_settings;

CREATE POLICY "Enable read for all authenticated users" ON public.system_settings
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all for admin/super_admin" ON public.system_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin', 'super_admin')
        )
    );
