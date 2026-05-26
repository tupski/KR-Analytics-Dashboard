'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface AppSettings {
    app_name: string;
    logo_url: string | null;
    favicon_url: string | null;
    primary_color: string;
}

/**
 * Fetch app settings from app_settings table
 */
export async function fetchAppSettings(): Promise<AppSettings> {
    const supabase = createServerClient();

    const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .single();

    if (error) {
        console.error('[fetchAppSettings] Error:', error);
        // Return defaults if no settings exist yet
        return {
            app_name: 'Kakarama Room Analytics',
            logo_url: null,
            favicon_url: null,
            primary_color: '#2563eb',
        };
    }

    return {
        app_name: data.app_name || 'Kakarama Room Analytics',
        logo_url: data.logo_url || null,
        favicon_url: data.favicon_url || null,
        primary_color: data.primary_color || '#2563eb',
    };
}

/**
 * Update app settings
 */
export async function updateAppSettings(settings: Partial<AppSettings>): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createServerClient();

        // Check if settings exist
        const { data: existing } = await supabase
            .from('app_settings')
            .select('id')
            .limit(1)
            .single();

        if (existing) {
            // Update existing
            const { error } = await supabase
                .from('app_settings')
                .update(settings)
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            // Insert new
            const { error } = await supabase
                .from('app_settings')
                .insert({
                    app_name: settings.app_name || 'Kakarama Room Analytics',
                    logo_url: settings.logo_url || null,
                    favicon_url: settings.favicon_url || null,
                    primary_color: settings.primary_color || '#2563eb',
                });

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
