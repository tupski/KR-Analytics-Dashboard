import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/app-settings
 * Returns app settings as JSON for client-side consumption.
 */
export async function GET() {
    try {
        const supabase = createServerClient();
        const { data, error } = await supabase
            .from('app_settings')
            .select('key, value');

        if (error || !data || data.length === 0) {
            return NextResponse.json({
                app_name: 'Kakarama Room Analytics',
                logo_url: null,
                favicon_url: null,
                primary_color: '#2563eb',
            });
        }

        const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));

        return NextResponse.json({
            app_name: map.app_name || 'Kakarama Room Analytics',
            logo_url: map.logo_url || null,
            favicon_url: map.favicon_url || null,
            primary_color: map.primary_color || '#2563eb',
        });
    } catch {
        return NextResponse.json({
            app_name: 'Kakarama Room Analytics',
            logo_url: null,
            favicon_url: null,
            primary_color: '#2563eb',
        });
    }
}