-- ============================================================================
-- App Settings & User Roles Tables
-- Created: 2026-05-26
-- Purpose: Store application settings and user role management
-- ============================================================================

-- ── App Settings Table ──────────────────────────────────────────────────────
-- Stores global application settings (logo, theme, etc.)
-- Only one row should exist in this table

-- Check if table exists, if not create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_settings') THEN
        CREATE TABLE app_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            app_name TEXT NOT NULL DEFAULT 'Kakarama Room Analytics',
            logo_url TEXT,
            favicon_url TEXT,
            primary_color TEXT NOT NULL DEFAULT '#2563eb',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    END IF;
END $$;

-- Add columns if they don't exist (safe migration)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'app_name') THEN
        ALTER TABLE app_settings ADD COLUMN app_name TEXT NOT NULL DEFAULT 'Kakarama Room Analytics';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'logo_url') THEN
        ALTER TABLE app_settings ADD COLUMN logo_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'favicon_url') THEN
        ALTER TABLE app_settings ADD COLUMN favicon_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'primary_color') THEN
        ALTER TABLE app_settings ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#2563eb';
    END IF;
END $$;

-- Insert default settings if table is empty
INSERT INTO app_settings (app_name, logo_url, favicon_url, primary_color)
SELECT 'Kakarama Room Analytics', NULL, NULL, '#2563eb'
WHERE NOT EXISTS (SELECT 1 FROM app_settings);

-- ── User Roles Table ────────────────────────────────────────────────────────
-- Maps Supabase auth users to application roles
-- Roles: super_admin, admin, staff, viewer

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'staff', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe migration)
DROP POLICY IF EXISTS "Anyone can read app settings" ON app_settings;
DROP POLICY IF EXISTS "Only super_admin can update app settings" ON app_settings;
DROP POLICY IF EXISTS "Only super_admin can insert app settings" ON app_settings;
DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;
DROP POLICY IF EXISTS "Super admin can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Only super_admin can manage roles" ON user_roles;

-- App Settings: Anyone authenticated can read, only super_admin can update
CREATE POLICY "Anyone can read app settings"
    ON app_settings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only super_admin can update app settings"
    ON app_settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'super_admin'
        )
    );

CREATE POLICY "Only super_admin can insert app settings"
    ON app_settings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'super_admin'
        )
    );

-- User Roles: Users can read their own role, super_admin can manage all
CREATE POLICY "Users can read their own role"
    ON user_roles FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Super admin can read all roles"
    ON user_roles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'super_admin'
        )
    );

CREATE POLICY "Only super_admin can manage roles"
    ON user_roles FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.role = 'super_admin'
        )
    );

-- ── Triggers ────────────────────────────────────────────────────────────────

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;

CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE app_settings IS 'Global application settings (logo, theme, etc.)';
COMMENT ON TABLE user_roles IS 'User role assignments for access control';

COMMENT ON COLUMN app_settings.app_name IS 'Application name displayed in UI';
COMMENT ON COLUMN app_settings.logo_url IS 'URL to application logo image';
COMMENT ON COLUMN app_settings.favicon_url IS 'URL to favicon image';
COMMENT ON COLUMN app_settings.primary_color IS 'Primary theme color (hex format)';

COMMENT ON COLUMN user_roles.user_id IS 'Reference to auth.users';
COMMENT ON COLUMN user_roles.role IS 'User role: super_admin, admin, staff, or viewer';
