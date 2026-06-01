'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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

    const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));

    return {
        app_name: map.app_name || 'Kakarama Room Analytics',
        logo_url: map.logo_url || null,
        favicon_url: map.favicon_url || null,
        primary_color: map.primary_color || '#2563eb',
        report_period_mode: map.report_period_mode || 'calendar_day',
        timezone: map.timezone || 'Asia/Jakarta',
        sidebar_behavior: map.sidebar_behavior || 'default',
        compact_display: map.compact_display || 'false',
        ai_insight_enabled: map.ai_insight_enabled || 'false',
        ai_insight_mode: map.ai_insight_mode || 'ai-with-fallback',
        ai_insight_provider: map.ai_insight_provider || '',
        ai_insight_model: map.ai_insight_model || '',
        ai_insight_cache_ttl_minutes: map.ai_insight_cache_ttl_minutes || '30',
        ai_insight_auto_refresh: map.ai_insight_auto_refresh || 'true',
    };
}

/**
 * Update app settings
 */
export async function updateAppSettings(settings: Partial<AppSettings>): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createServerClient();

        // app_settings uses key-value pairs (key, value, updated_at)
        // Upsert each setting individually
        const entries: { key: string; value: string }[] = [];

        if (settings.app_name !== undefined) {
            entries.push({ key: 'app_name', value: settings.app_name });
        }
        if (settings.logo_url !== undefined) {
            entries.push({ key: 'logo_url', value: settings.logo_url || '' });
        }
        if (settings.favicon_url !== undefined) {
            entries.push({ key: 'favicon_url', value: settings.favicon_url || '' });
        }
        if (settings.primary_color !== undefined) {
            entries.push({ key: 'primary_color', value: settings.primary_color });
        }
        if (settings.report_period_mode !== undefined) {
            entries.push({ key: 'report_period_mode', value: settings.report_period_mode });
        }
        if (settings.timezone !== undefined) {
            entries.push({ key: 'timezone', value: settings.timezone });
        }
        if (settings.sidebar_behavior !== undefined) {
            entries.push({ key: 'sidebar_behavior', value: settings.sidebar_behavior });
        }
        if (settings.compact_display !== undefined) {
            entries.push({ key: 'compact_display', value: settings.compact_display });
        }
        // AI Insight settings
        if (settings.ai_insight_enabled !== undefined) {
            entries.push({ key: 'ai_insight_enabled', value: settings.ai_insight_enabled });
        }
        if (settings.ai_insight_mode !== undefined) {
            entries.push({ key: 'ai_insight_mode', value: settings.ai_insight_mode });
        }
        if (settings.ai_insight_provider !== undefined) {
            entries.push({ key: 'ai_insight_provider', value: settings.ai_insight_provider });
        }
        if (settings.ai_insight_model !== undefined) {
            entries.push({ key: 'ai_insight_model', value: settings.ai_insight_model });
        }
        if (settings.ai_insight_cache_ttl_minutes !== undefined) {
            entries.push({ key: 'ai_insight_cache_ttl_minutes', value: settings.ai_insight_cache_ttl_minutes });
        }
        if (settings.ai_insight_auto_refresh !== undefined) {
            entries.push({ key: 'ai_insight_auto_refresh', value: settings.ai_insight_auto_refresh });
        }

        for (const entry of entries) {
            const { error } = await supabase
                .from('app_settings')
                .upsert(entry, { onConflict: 'key' });

            if (error) throw error;
        }

        revalidatePath('/pengaturan');
        return { success: true };
    } catch (error: any) {
        console.error('[updateAppSettings] Error:', error);
        return { success: false, error: error.message || 'Gagal menyimpan pengaturan' };
    }
}

/**
 * Upload image to Catbox.moe (simple, no API key needed)
 * Returns the direct URL to the uploaded image
 */
export async function uploadToCatbox(file: File): Promise<{ success: boolean; url?: string; error?: string }> {
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
    } catch (error: any) {
        console.error('[uploadToCatbox] Error:', error);
        return { success: false, error: error.message || 'Gagal upload gambar' };
    }
}
