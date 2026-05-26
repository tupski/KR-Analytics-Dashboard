import { unstable_cache } from 'next/cache';

/**
 * Cache Utilities
 * 
 * Provides caching helpers for dashboard data with configurable TTL.
 * Uses Next.js unstable_cache for server-side caching.
 * 
 * Features:
 * - 5 minute cache duration for dashboard data
 * - Automatic cache invalidation
 * - Tagged caching for selective revalidation
 * 
 */

// Cache duration in seconds
export const CACHE_DURATION = {
    KPI: 300, // 5 minutes
    REVENUE: 300, // 5 minutes
    OCCUPANCY: 300, // 5 minutes
    CHECKINS: 60, // 1 minute (more frequent for real-time data)
    CHECKOUTS: 60, // 1 minute
    UNIT_STATUS: 180, // 3 minutes
};

// Cache tags for selective revalidation
export const CACHE_TAGS = {
    KPI: 'kpi-data',
    REVENUE: 'revenue-data',
    OCCUPANCY: 'occupancy-data',
    CHECKINS: 'checkins-data',
    CHECKOUTS: 'checkouts-data',
    UNIT_STATUS: 'unit-status-data',
    ALL_DASHBOARD: 'dashboard-data',
};

/**
 * Create a cached version of a function
 * 
 * @param fn Function to cache
 * @param keyParts Cache key parts
 * @param options Cache options (revalidate, tags)
 * @returns Cached function
 */
export function createCachedFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    keyParts: string[],
    options: {
        revalidate?: number;
        tags?: string[];
    } = {}
): T {
    return unstable_cache(
        fn,
        keyParts,
        {
            revalidate: options.revalidate,
            tags: options.tags,
        }
    ) as T;
}

/**
 * Helper to generate cache key with date
 * Useful for daily data that should be cached per day
 */
export function getDailyCacheKey(prefix: string): string {
    const today = new Date().toISOString().split('T')[0];
    return `${prefix}-${today}`;
}

/**
 * Helper to generate cache key with timestamp
 * Useful for data that changes frequently
 */
export function getTimestampCacheKey(prefix: string, minutes: number = 5): string {
    const now = new Date();
    const roundedMinutes = Math.floor(now.getMinutes() / minutes) * minutes;
    const timestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), roundedMinutes);
    return `${prefix}-${timestamp.getTime()}`;
}
