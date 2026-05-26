'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import RealTimeClock from './RealTimeClock';

interface AutoRefreshWrapperProps {
    children: React.ReactNode;
    refreshInterval?: number; // milliseconds, default 60000 (60 seconds)
}

/**
 * AutoRefreshWrapper - Auto-refresh Component
 * 
 * Manages automatic data refresh at specified intervals.
 * Pauses refresh when tab is not visible and resumes when tab becomes visible.
 * 
 * Features:
 * - Automatic refresh every 60 seconds (configurable)
 * - Pause refresh when tab is hidden
 * - Resume and immediately refresh when tab becomes visible
 * - Display last refresh timestamp
 * - Show loading indicator during refresh
 * - Handle refresh failures with retry logic
 * - Manual refresh button
 * 
 */
export default function AutoRefreshWrapper({
    children,
    refreshInterval = 60000, // 60 seconds
}: AutoRefreshWrapperProps) {
    const router = useRouter();
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const handleRefresh = useCallback(async () => {
        // Don't refresh if already refreshing
        if (isRefreshing) return;

        setIsRefreshing(true);
        setError(null);

        try {
            // Use Next.js router.refresh() to refresh server components
            router.refresh();
            setLastRefresh(new Date());
            setRetryCount(0); // Reset retry count on success
        } catch (err) {
            console.error('Error refreshing dashboard:', err);
            setError('Gagal memperbarui data');
            setRetryCount((prev) => prev + 1);
        } finally {
            setIsRefreshing(false);
        }
    }, [router, isRefreshing]);

    // Set up auto-refresh interval
    useEffect(() => {
        // Handle visibility change
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // Tab became visible, refresh immediately
                handleRefresh();
            }
        };

        // Add visibility change listener
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Set up refresh interval
        const interval = setInterval(() => {
            // Only refresh if tab is visible
            if (document.visibilityState === 'visible') {
                handleRefresh();
            }
        }, refreshInterval);

        // Cleanup
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(interval);
        };
    }, [refreshInterval, handleRefresh]);

    // Retry logic for failed refreshes
    useEffect(() => {
        if (retryCount > 0 && retryCount < 3) {
            // Retry after 10 seconds for up to 3 attempts
            const retryTimeout = setTimeout(() => {
                handleRefresh();
            }, 10000);

            return () => clearTimeout(retryTimeout);
        }
    }, [retryCount, handleRefresh]);

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

    return (
        <div className="relative">
            {/* Compact refresh indicator — minimal on mobile */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                        title="Refresh manual"
                        aria-label="Refresh data"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline text-xs">Refresh</span>
                    </button>

                    <span className="text-gray-400 truncate">
                        {isRefreshing ? 'Memperbarui...' : `Diperbarui ${formatLastRefresh()}`}
                    </span>

                    {error && retryCount > 0 && (
                        <span className="text-red-500 text-[10px] truncate">{error}</span>
                    )}
                </div>

                <RealTimeClock />
            </div>

            {/* Main content */}
            <div className={isRefreshing ? 'opacity-90 transition-opacity' : ''}>
                {children}
            </div>
        </div>
    );
}
