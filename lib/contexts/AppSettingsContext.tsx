'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { AppSettings } from '@/app/(dashboard)/pengaturan/actions';
import { DEFAULTS, AI_CONFIG } from '@/lib/config/constants';

interface AppSettingsContextValue {
    settings: AppSettings;
    loading: boolean;
    refresh: () => void;
}

const defaults: AppSettings = {
    app_name: DEFAULTS.APP_NAME,
    logo_url: null,
    favicon_url: null,
    primary_color: DEFAULTS.PRIMARY_COLOR,
    report_period_mode: DEFAULTS.REPORT_PERIOD_MODE,
    timezone: DEFAULTS.TIMEZONE,
    sidebar_behavior: DEFAULTS.SIDEBAR_BEHAVIOR,
    compact_display: String(DEFAULTS.COMPACT_DISPLAY),
    ai_insight_enabled: 'false',
    ai_insight_mode: DEFAULTS.INSIGHT_MODE,
    ai_insight_provider: '',
    ai_insight_model: '',
    ai_insight_cache_ttl_minutes: String(AI_CONFIG.INSIGHT_CACHE_TTL_MINUTES),
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
                            timezone: data.timezone || defaults.timezone,
                            sidebar_behavior: data.sidebar_behavior || defaults.sidebar_behavior,
                            compact_display: data.compact_display || defaults.compact_display,
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