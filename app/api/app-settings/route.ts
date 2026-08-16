import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAdmin, isGuardError } from '@/lib/security/guard';

// Keys that should be returned as-is (string)
const STRING_KEYS = [
    'app_name',
    'logo_url',
    'favicon_url',
    'primary_color',
    'report_period_mode',
    'ai_insight_enabled',
    'ai_insight_mode',
    'ai_insight_provider',
    'ai_insight_model',
    'ai_insight_cache_ttl_minutes',
    'ai_insight_auto_refresh',
];

/**
 * GET /api/app-settings
 * Returns all app settings (general + AI Insight) as JSON.
 */
export async function GET() {
    try {
        const guard = await requireAdmin();
        if (isGuardError(guard)) return guard;

        const supabase = createServerClient();
        const { data, error } = await supabase
            .from('app_settings')
            .select('key, value');

        if (error || !data || data.length === 0) {
            return NextResponse.json(defaultSettings());
        }

        const map = Object.fromEntries(data.map((r: any) => [r.key, r.value]));

        return NextResponse.json({
            app_name: map.app_name || 'Kakarama Room Analytics',
            logo_url: map.logo_url || null,
            favicon_url: map.favicon_url || null,
            primary_color: map.primary_color || '#2563eb',
            report_period_mode: map.report_period_mode || 'calendar_day',
            ai_insight_enabled: map.ai_insight_enabled || 'false',
            ai_insight_mode: map.ai_insight_mode || 'ai-with-fallback',
            ai_insight_provider: map.ai_insight_provider || '',
            ai_insight_model: map.ai_insight_model || '',
            ai_insight_cache_ttl_minutes: map.ai_insight_cache_ttl_minutes || '30',
            ai_insight_auto_refresh: map.ai_insight_auto_refresh || 'true',
        });
    } catch {
        return NextResponse.json(defaultSettings());
    }
}

/**
 * POST /api/app-settings
 * Upsert one or more app settings.
 * Body: { key: string, value: string } | { settings: Record<string, string> }
 */
export async function POST(request: NextRequest) {
    try {
        const guard = await requireAdmin();
        if (isGuardError(guard)) return guard;

        const supabase = createServerClient();
        const body = await request.json();

        let entries: { key: string; value: string }[] = [];

        if (body.settings && typeof body.settings === 'object') {
            // Bulk upsert: { settings: { key1: val1, key2: val2 } }
            entries = Object.entries(body.settings).map(([key, value]) => ({
                key,
                value: String(value ?? ''),
            }));
        } else if (body.key) {
            // Single upsert: { key: '...', value: '...' }
            entries = [{ key: body.key, value: String(body.value ?? '') }];
        } else {
            return NextResponse.json({ error: 'Invalid body: provide { key, value } or { settings }' }, { status: 400 });
        }

        for (const entry of entries) {
            if (!entry.key) continue;
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: entry.key, value: entry.value }, { onConflict: 'key' });

            if (error) throw error;
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

function defaultSettings() {
    return {
        app_name: 'Kakarama Room Analytics',
        logo_url: null,
        favicon_url: null,
        primary_color: '#2563eb',
        report_period_mode: 'calendar_day',
        ai_insight_enabled: 'false',
        ai_insight_mode: 'ai-with-fallback',
        ai_insight_provider: '',
        ai_insight_model: '',
        ai_insight_cache_ttl_minutes: '30',
        ai_insight_auto_refresh: 'true',
    };
}
