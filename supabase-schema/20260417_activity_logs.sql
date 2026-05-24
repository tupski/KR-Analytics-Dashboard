-- =============================================================
-- MIGRATION: Activity Logs System
-- =============================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    role VARCHAR(50),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index untuk performa pencarian log
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Semua user authenticated bisa baca log (tergantung kebutuhan, tapi biasanya Admin/SuperAdmin saja)
CREATE POLICY "Enable read for admin/super_admin" ON public.activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin', 'super_admin')
        )
    );

-- Fungsi helper untuk mencatat log dari RPC atau aplikasi
CREATE OR REPLACE FUNCTION public.log_activity(
    p_action text,
    p_details text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_name text;
    v_role text;
BEGIN
    SELECT full_name, role 
    INTO v_user_name, v_role
    FROM public.user_profiles
    WHERE id = auth.uid();

    INSERT INTO public.activity_logs (user_id, user_name, role, action, details, metadata)
    VALUES (auth.uid(), v_user_name, v_role, p_action, p_details, p_metadata);
END;
$$;
