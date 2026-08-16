'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { DEFAULTS } from '@/lib/config/constants';
import { AppSettingsSchema, validateInput } from '@/lib/validation';
import { getSession, getUserRole } from '@/lib/supabase/auth';

// ─── Session Guard for Server Actions ────────────────────────────
/**
 * Validate that the caller is an authenticated super_admin.
 * Server actions cannot return NextResponse, so we return a typed
 * error object instead — the caller should check for `authError`.
 */
async function requireAdminAction(): Promise<{ authError: string } | null> {
    const session = await getSession();
    if (!session?.user) return { authError: 'Autentikasi diperlukan.' };
    const role = await getUserRole(session.user.id);
    if (role !== 'super_admin') return { authError: 'Akses ditolak. Hanya super admin.' };
    return null;
}

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface AppSettings {
    app_name: string;
    logo_url: string | null;
    favicon_url: string | null;
    primary_color: string;
    report_period_mode: string;
    timezone: string;
    sidebar_behavior: string;
    compact_display: string;
    // AI Insight settings
    ai_insight_enabled?: string;
    ai_insight_mode?: string;
    ai_insight_provider?: string;
    ai_insight_model?: string;
    ai_insight_cache_ttl_minutes?: string;
    ai_insight_auto_refresh?: string;
    // System tab
    chat_history_retention_days?: number;
}

/**
 * Fetch app settings from app_settings table
 */
export async function fetchAppSettings(): Promise<AppSettings> {
    const supabase = createServerClient();

    // app_settings uses key-value pairs (key, value, updated_at)
    const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');

    if (error || !data || data.length === 0) {
        console.error('[fetchAppSettings] Error or empty:', error);
        return {
            app_name: 'Kakarama Room Analytics',
            logo_url: null,
            favicon_url: null,
            primary_color: '#2563eb',
            report_period_mode: 'calendar_day',
            timezone: 'Asia/Jakarta',
            sidebar_behavior: 'default',
            compact_display: 'false',
        };
    }

    const map = Object.fromEntries(data.map((r: { key: string; value: string }) => [r.key, r.value]));

    return {
        app_name: map.app_name || DEFAULTS.APP_NAME,
        logo_url: map.logo_url || null,
        favicon_url: map.favicon_url || null,
        primary_color: map.primary_color || DEFAULTS.PRIMARY_COLOR,
        report_period_mode: map.report_period_mode || DEFAULTS.REPORT_PERIOD_MODE,
        timezone: map.timezone || DEFAULTS.TIMEZONE,
        sidebar_behavior: map.sidebar_behavior || DEFAULTS.SIDEBAR_BEHAVIOR,
        compact_display: map.compact_display || String(DEFAULTS.COMPACT_DISPLAY),
        ai_insight_enabled: map.ai_insight_enabled || 'false',
        ai_insight_mode: map.ai_insight_mode || 'ai-with-fallback',
        ai_insight_provider: map.ai_insight_provider || '',
        ai_insight_model: map.ai_insight_model || '',
        ai_insight_cache_ttl_minutes: map.ai_insight_cache_ttl_minutes || '30',
        ai_insight_auto_refresh: map.ai_insight_auto_refresh || 'true',
    };
}

/**
 * Update app settings with Zod validation
 */
export async function updateAppSettings(settings: unknown): Promise<{
    success: boolean;
    error?: string;
    fieldErrors?: Record<string, string>;
    authError?: string;
}> {
    // Session / role guard — must be super_admin to mutate settings
    const authCheck = await requireAdminAction();
    if (authCheck) return { success: false, ...authCheck };

    // Validate input using Zod schema (imported from lib/validation.ts)
    const validation = validateInput(AppSettingsSchema, settings);
    if (!validation.success) {
        console.error('[updateAppSettings] Validation error:', validation.error, validation.fieldErrors);
        return {
            success: false,
            error: validation.error,
            fieldErrors: validation.fieldErrors,
        };
    }

    // Type-safe validated settings
    const validatedSettings = validation.data as Partial<AppSettings>;

    try {
        const supabase = createServerClient();

        // app_settings uses key-value pairs (key, value, updated_at)
        // Upsert each setting individually
        const entries: { key: string; value: string }[] = [];

        if (validatedSettings.app_name !== undefined) {
            entries.push({ key: 'app_name', value: validatedSettings.app_name });
        }
        if (validatedSettings.logo_url !== undefined) {
            entries.push({ key: 'logo_url', value: validatedSettings.logo_url || '' });
        }
        if (validatedSettings.favicon_url !== undefined) {
            entries.push({ key: 'favicon_url', value: validatedSettings.favicon_url || '' });
        }
        if (validatedSettings.primary_color !== undefined) {
            entries.push({ key: 'primary_color', value: validatedSettings.primary_color });
        }
        if (validatedSettings.report_period_mode !== undefined) {
            entries.push({ key: 'report_period_mode', value: validatedSettings.report_period_mode });
        }
        if (validatedSettings.timezone !== undefined) {
            entries.push({ key: 'timezone', value: validatedSettings.timezone });
        }
        if (validatedSettings.sidebar_behavior !== undefined) {
            entries.push({ key: 'sidebar_behavior', value: validatedSettings.sidebar_behavior });
        }
        if (validatedSettings.compact_display !== undefined) {
            entries.push({ key: 'compact_display', value: validatedSettings.compact_display });
        }
        // AI Insight settings
        if (validatedSettings.ai_insight_enabled !== undefined) {
            entries.push({ key: 'ai_insight_enabled', value: validatedSettings.ai_insight_enabled });
        }
        if (validatedSettings.ai_insight_mode !== undefined) {
            entries.push({ key: 'ai_insight_mode', value: validatedSettings.ai_insight_mode });
        }
        if (validatedSettings.ai_insight_provider !== undefined) {
            entries.push({ key: 'ai_insight_provider', value: validatedSettings.ai_insight_provider });
        }
        if (validatedSettings.ai_insight_model !== undefined) {
            entries.push({ key: 'ai_insight_model', value: validatedSettings.ai_insight_model });
        }
        if (validatedSettings.ai_insight_cache_ttl_minutes !== undefined) {
            entries.push({ key: 'ai_insight_cache_ttl_minutes', value: validatedSettings.ai_insight_cache_ttl_minutes });
        }
        if (validatedSettings.ai_insight_auto_refresh !== undefined) {
            entries.push({ key: 'ai_insight_auto_refresh', value: validatedSettings.ai_insight_auto_refresh });
        }
        // System tab — chat history retention
        if (validatedSettings.chat_history_retention_days !== undefined) {
            entries.push({ key: 'chat_history_retention_days', value: String(validatedSettings.chat_history_retention_days) });
        }

        for (const entry of entries) {
            const { error } = await supabase
                .from('app_settings')
                .upsert(entry, { onConflict: 'key' });

            if (error) throw error;
        }

        revalidatePath('/pengaturan');
        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Gagal menyimpan pengaturan';
        console.error('[updateAppSettings] Error:', errorMessage);
        return { success: false, error: errorMessage };
    }
}

/**
 * Upload image to Catbox.moe (simple, no API key needed)
 * Returns the direct URL to the uploaded image
 */
export async function uploadToCatbox(file: File): Promise<{ success: boolean; url?: string; error?: string; authError?: string }> {
    // Session / role guard — only admins may upload branding assets
    const authCheck = await requireAdminAction();
    if (authCheck) return { success: false, ...authCheck };

    try {
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', file);

        const response = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        const url = await response.text();

        // Catbox returns the URL as plain text
        if (!url || !url.startsWith('https://files.catbox.moe/')) {
            throw new Error('Invalid response from Catbox');
        }

        return { success: true, url: url.trim() };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Gagal upload gambar';
        console.error('[uploadToCatbox] Error:', errorMessage);
        return { success: false, error: errorMessage };
    }
}
