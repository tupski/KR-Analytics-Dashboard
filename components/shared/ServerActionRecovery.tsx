'use client';

import { useEffect } from 'react';

/**
 * ServerActionRecovery — Client-only component that detects Next.js Server Action
 * mismatch errors (caused by stale browser references after a deployment rebuild)
 * and performs a single hard reload to fetch the fresh bundle.
 *
 * This avoids infinite reload loops by using sessionStorage as a one-shot guard.
 */
export default function ServerActionRecovery() {
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const RELOAD_FLAG_KEY = 'serverActionReloaded';

        const handleServerError = (event: ErrorEvent) => {
            const error = event.error;
            if (!error) return;

            const message = error.message || error.stack || '';

            // Detect Next.js Server Action mismatch error
            const isServerActionError =
                typeof message === 'string' &&
                (message.includes('Server Action') ||
                    message.includes('server action') ||
                    message.includes('ACTION_ID') ||
                    message.includes('could not find server action'));

            if (!isServerActionError) return;

            // One-shot reload guard
            const hasReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY);
            if (!hasReloaded) {
                console.warn('[ServerActionRecovery] Detected stale server action reference, reloading...');
                sessionStorage.setItem(RELOAD_FLAG_KEY, 'true');
                // Hard reload to clear stale Next.js flight response cache
                window.location.href = window.location.href;
            }
        };

        // Also listen for unhandledrejection (Promise rejections)
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            if (!reason) return;

            const message = typeof reason === 'string'
                ? reason
                : (reason?.message || reason?.stack || '');

            const isServerActionError =
                typeof message === 'string' &&
                (message.includes('Server Action') ||
                    message.includes('server action') ||
                    message.includes('ACTION_ID') ||
                    message.includes('could not find server action'));

            if (!isServerActionError) return;

            const hasReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY);
            if (!hasReloaded) {
                console.warn('[ServerActionRecovery] Detected stale server action (promise), reloading...');
                sessionStorage.setItem(RELOAD_FLAG_KEY, 'true');
                window.location.href = window.location.href;
            }
        };

        window.addEventListener('error', handleServerError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleServerError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    return null;
}
