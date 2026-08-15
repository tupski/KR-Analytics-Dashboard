'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import RealTimeClock from './RealTimeClock';
import { REFRESH } from '@/lib/config/constants';

const AUTO_REFRESH_KEY = 'kr_dashboard_auto_refresh';
const MANUAL_REFRESH_KEY = 'kr_dashboard_manual_refresh_at';

function readAutoRefreshPref(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(AUTO_REFRESH_KEY) === '1';
    } catch {
        return false;
    }
}

/** Remaining cooldown ms persisted from a previous manual refresh (0 = ready). */
function readCooldownRemaining(): number {
    if (typeof window === 'undefined') return 0;
    try {
        const raw = window.localStorage.getItem(MANUAL_REFRESH_KEY);
        if (!raw) return 0;
        const at = parseInt(raw, 10);
        if (!Number.isFinite(at)) return 0;
        return Math.max(0, at + REFRESH.MANUAL_COOLDOWN_MS - Date.now());
    } catch {
        return 0;
    }
}

/**
 * AutoRefreshWrapper - Dashboard refresh control
 *
 * Data is fetched ONLY on user action:
 * - "Auto refresh setiap 5 menit" checkbox (default OFF, persisted). While checked,
 *   refresh runs every 5 minutes. Unchecking stops polling entirely.
 * - "Refresh Data" button, rate-limited to once per 60 seconds (cooldown persisted,
 *   so a page reload cannot bypass it). Button disabled during cooldown.
 * - No unconditional polling on load.
 *
 * Form-safe guard: auto-refresh skips while user is editing a form, a modal is
 * open, or the tab is hidden. The manual button bypasses this guard.
 */
export default function AutoRefreshWrapper({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [autoRefresh, setAutoRefresh] = useState<boolean>(() => readAutoRefreshPref());
    const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());
    const [cooldownRemaining, setCooldownRemaining] = useState<number>(() => readCooldownRemaining());
    const [error, setError] = useState<string | null>(null);
    const isRefreshing = useRef(false);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cooldownActive = cooldownRemaining > 0;

    /**
     * Form-safe guard — prevents auto-refresh when user is interacting with forms.
     * Manual refresh button bypasses this guard.
     */
    const shouldSkipRefresh = useCallback((): boolean => {
        // Don't refresh if page is hidden
        if (document.visibilityState !== 'visible') return true;

        // Don't refresh if there's an active form being edited
        if (document.querySelector('[data-form-dirty="true"]')) return true;

        // Don't refresh if user is typing in an input or textarea
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return true;

        // Don't refresh if a modal/dialog is open
        if (document.querySelector('[role="dialog"]') || document.querySelector('[role="modal"]')) return true;

        return false;
    }, []);

    /** Core refresh: re-fetch server components via Next.js router. */
    const runRefresh = useCallback(() => {
        if (isRefreshing.current) return;
        isRefreshing.current = true;
        setError(null);
        try {
            router.refresh();
            setLastRefresh(new Date());
        } catch {
            setError('Gagal memperbarui data');
        } finally {
            isRefreshing.current = false;
        }
    }, [router]);

    /** Manual refresh — enforces 1-minute cooldown persisted across reloads. */
    const handleManualRefresh = useCallback(() => {
        if (cooldownActive || isRefreshing.current) return;
        try {
            window.localStorage.setItem(MANUAL_REFRESH_KEY, String(Date.now()));
        } catch {
            // Ignore storage failures — cooldown still applies for this session
        }
        setCooldownRemaining(REFRESH.MANUAL_COOLDOWN_MS);
        runRefresh();
    }, [cooldownActive, runRefresh]);

    /** Toggle auto-refresh checkbox; persisted. Checking triggers one immediate refresh. */
    const handleToggleAutoRefresh = useCallback(() => {
        setAutoRefresh((prev) => {
            const next = !prev;
            try {
                window.localStorage.setItem(AUTO_REFRESH_KEY, next ? '1' : '0');
            } catch {
                // Ignore storage failures — session-only fallback
            }
            if (next) runRefresh();
            return next;
        });
    }, [runRefresh]);

    // Cooldown countdown ticker
    useEffect(() => {
        if (!cooldownActive) return;
        const interval = setInterval(() => {
            setCooldownRemaining((prev) => Math.max(0, prev - 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [cooldownActive]);

    // Auto-refresh interval — runs ONLY while checkbox is checked
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            if (!shouldSkipRefresh()) runRefresh();
        }, REFRESH.AUTO_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [autoRefresh, shouldSkipRefresh, runRefresh]);

    // Visibility change — only when auto-refresh enabled; debounced
    useEffect(() => {
        if (!autoRefresh) return;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && !shouldSkipRefresh()) {
                refreshTimer.current = setTimeout(() => {
                    if (!shouldSkipRefresh()) runRefresh();
                }, 500);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
        };
    }, [autoRefresh, shouldSkipRefresh, runRefresh]);

    // Format last refresh time
    const formatLastRefresh = () => {
        const now = new Date();
        const diffMs = now.getTime() - lastRefresh.getTime();
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);

        if (diffSeconds < 60) {
            return `${diffSeconds} detik yang lalu`;
        } else if (diffMinutes < 60) {
            return `${diffMinutes} menit yang lalu`;
        } else {
            return lastRefresh.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
            });
        }
    };

    const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);

    return (
        <div className="relative">
            {/* Compact refresh controls — wraps on mobile */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-3 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Manual refresh button with cooldown */}
                    <button
                        onClick={handleManualRefresh}
                        disabled={cooldownActive || isRefreshing.current}
                        className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        title={cooldownActive ? `Tunggu ${cooldownSeconds} detik` : 'Refresh data'}
                        aria-label="Refresh data"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing.current ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline text-xs">
                            {cooldownActive ? `Refresh (${cooldownSeconds}s)` : 'Refresh Data'}
                        </span>
                    </button>

                    {/* Auto-refresh checkbox — default OFF */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0" title="Perbarui data otomatis setiap 5 menit">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={handleToggleAutoRefresh}
                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                            aria-label="Auto refresh setiap 5 menit"
                        />
                        <span className="text-gray-600">Auto refresh 5 menit</span>
                    </label>

                    <span className="text-gray-400 truncate min-w-0">
                        {isRefreshing.current ? 'Memperbarui...' : `Diperbarui ${formatLastRefresh()}`}
                    </span>

                    {error && (
                        <span className="text-red-500 text-[10px] truncate">{error}</span>
                    )}
                </div>

                <RealTimeClock />
            </div>

            {/* Main content */}
            <div className={isRefreshing.current ? 'opacity-90 transition-opacity' : ''}>
                {children}
            </div>
        </div>
    );
}
