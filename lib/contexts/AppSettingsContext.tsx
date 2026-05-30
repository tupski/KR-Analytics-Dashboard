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