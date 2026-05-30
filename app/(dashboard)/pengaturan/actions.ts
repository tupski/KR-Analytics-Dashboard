'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface AppSettings {
    app_name: string;
    logo_url: string | null;
    favicon_url: string | null;
    primary_color: string;
    report_period_mode: string;
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
        };
    }

    const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));

    return {
        app_name: map.app_name || 'Kakarama Room Analytics',
        logo_url: map.logo_url || null,
        favicon_url: map.favicon_url || null,
        primary_color: map.primary_color || '#2563eb',
        report_period_mode: map.report_period_mode || 'calendar_day',
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
