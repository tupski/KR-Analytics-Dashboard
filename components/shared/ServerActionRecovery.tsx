'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

const RELOAD_FLAG_KEY = 'serverActionReloaded';
const RECOVERY_ATTEMPTED_KEY = 'serverActionRecoveryAttempted';

/**
 * All known Server Action error signatures from stale JS after deploy.
 */
const SERVER_ACTION_PATTERNS = [
    'ACTION_ID',
    'UnrecognizedActionError',
    'Server Action was not found',
    'Failed to find Server Action',
    'could not find server action',
    'Server Action',
    'server action',
    'NEXT_REDIRECT',
];

function isServerActionError(message: string): boolean {
    return SERVER_ACTION_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Clear ALL browser caches via Cache API.
 * This purges stale next-static, next-image, workbox-* and any RSC payload caches.
 */
async function clearBrowserCaches(): Promise<void> {
    if (typeof caches === 'undefined') return;
    try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
        // Cache API unavailable — skip silently
    }
}

/**
 * Unregister all service workers so no stale SW intercepts navigation/fetch.
 */
async function unregisterServiceWorkers(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
    } catch {
        // SW unavailable — skip
    }
}

/**
 * Full recovery: clear caches, unregister SW, then hard reload.
 * sessionStorage guard prevents infinite loops.
 * Returns true if recovery was attempted (first call only).
 */
async function attemptFullRecovery(): Promise<boolean> {
    const hasAttempted = sessionStorage.getItem(RECOVERY_ATTEMPTED_KEY);
    if (hasAttempted) return false;

    sessionStorage.setItem(RECOVERY_ATTEMPTED_KEY, 'true');

    await Promise.all([
        clearBrowserCaches(),
        unregisterServiceWorkers(),
    ]);

    sessionStorage.setItem(RELOAD_FLAG_KEY, 'true');
    window.location.reload();
    return true;
}

export default function ServerActionRecovery() {
    const [showManualRecovery, setShowManualRecovery] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleServerError = async (event: ErrorEvent) => {
            const error = event.error;
            if (!error) return;

            const message = error.message || error.stack || '';
            if (typeof message !== 'string' || !isServerActionError(message)) return;

            event.preventDefault();

            const hasReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY);
            if (hasReloaded) {
                // Auto-reload already fired once — still broken, show manual button
                setShowManualRecovery(true);
                return;
            }

            console.warn('[ServerActionRecovery] Detected stale server action, attempting full recovery...');
            await attemptFullRecovery();
        };

        const handleUnhandledRejection = async (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            if (!reason) return;

            const message = typeof reason === 'string'
                ? reason
                : (reason?.message || reason?.stack || '');

            if (typeof message !== 'string' || !isServerActionError(message)) return;

            event.preventDefault();

            const hasReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY);
            if (hasReloaded) {
                setShowManualRecovery(true);
                return;
            }

            console.warn('[ServerActionRecovery] Detected stale server action (promise), attempting full recovery...');
            await attemptFullRecovery();
        };

        window.addEventListener('error', handleServerError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleServerError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    const handleManualRecovery = useCallback(async () => {
        await attemptFullRecovery();
    }, []);

    if (!showManualRecovery) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div className="bg-white rounded-lg shadow-lg border border-red-200 p-4 max-w-sm">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                            Sesi aplikasi perlu diperbarui
                        </p>
                        <p className="text-xs text-gray-600 mb-3">
                            Versi baru telah di-deploy. Bersihkan cache untuk melanjutkan.
                        </p>
                        <button
                            onClick={handleManualRecovery}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Clear cache & reload
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
