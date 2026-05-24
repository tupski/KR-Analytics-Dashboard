'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

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
 * Requirements: 17.1, 17.2, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10, 17.11
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
            {/* Refresh indicator bar */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Refresh manual"
                    >
                        <RefreshCw
                            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                        />
                        <span className="hidden sm:inline">Refresh</span>
                    </button>

                    <div className="h-4 w-px bg-gray-300"></div>

                    <span className="text-gray-500">
                        Terakhir diperbarui: {formatLastRefresh()}
                    </span>
                </div>

                {error && retryCount > 0 && (
                    <div className="flex items-center gap-2 text-red-600">
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <span className="text-sm">{error}</span>
                        {retryCount < 3 && (
                            <span className="text-xs text-gray-500">
                                (mencoba lagi...)
                            </span>
                        )}
                    </div>
                )}

                {isRefreshing && (
                    <div className="flex items-center gap-2 text-blue-600">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                        <span className="text-sm">Memperbarui data...</span>
                    </div>
                )}
            </div>

            {/* Main content */}
            <div className={isRefreshing ? 'opacity-90 transition-opacity' : ''}>
                {children}
            </div>
        </div>
    );
}
