'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { AppSettings } from '@/app/(dashboard)/pengaturan/actions';

interface AppSettingsContextValue {
    settings: AppSettings;
    loading: boolean;
    refresh: () => void;
}

const defaults: AppSettings = {
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

const AppSettingsCtx = createContext<AppSettingsContextValue>({
    settings: defaults,
    loading: true,
    refresh: () => { },
});

export function useAppSettings() {
    return useContext(AppSettingsCtx);
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(defaults);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = () => setRefreshKey(k => k + 1);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch('/api/app-settings');
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) {
                        setSettings({
                            app_name: data.app_name || defaults.app_name,
                            logo_url: data.logo_url || null,
                            favicon_url: data.favicon_url || null,
                            primary_color: data.primary_color || defaults.primary_color,
                            report_period_mode: data.report_period_mode || defaults.report_period_mode,
                            ai_insight_enabled: data.ai_insight_enabled || defaults.ai_insight_enabled,
                            ai_insight_mode: data.ai_insight_mode || defaults.ai_insight_mode,
                            ai_insight_provider: data.ai_insight_provider || defaults.ai_insight_provider,
                            ai_insight_model: data.ai_insight_model || defaults.ai_insight_model,
                            ai_insight_cache_ttl_minutes: data.ai_insight_cache_ttl_minutes || defaults.ai_insight_cache_ttl_minutes,
                            ai_insight_auto_refresh: data.ai_insight_auto_refresh || defaults.ai_insight_auto_refresh,
                        });
                    }
                }
            } catch {
                // Keep defaults on error
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [refreshKey]);

    return (
        <AppSettingsCtx.Provider value={{ settings, loading, refresh }}>
            {children}
        </AppSettingsCtx.Provider>
    );
}