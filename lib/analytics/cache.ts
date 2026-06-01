/**
 * Analytics Cache Layer
 *
 * Two-tier cache for the local analytics PostgreSQL database:
 *   1. analytics_query_cache — generic key-value query result cache
 *   2. analytics_cache_mart   — pre-computed analytical snapshots
 *
 * Core integration pattern:
 *   const data = await withCache('metric_name', { param1, param2 }, TTL.DASHBOARD_TODAY, async () => {
 *       // ... compute from analytics_* tables ...
 *       return result;
 *   });
 *
 * The withCache() wrapper checks the query cache first. On hit, returns.
 * On miss, executes the compute function, stores the result, returns.
 */

import { createHash } from 'crypto';
import { queryAnalytics } from './db';
import { CACHE_TTL } from '@/lib/config/constants';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CacheParams {
    [key: string]: unknown;
}

export interface CacheEntry<T = unknown> {
    cacheKey: string;
    metricName: string;
    params: CacheParams;
    result: T;
    generatedAt: Date;
    expiresAt: Date;
}

export interface CacheOptions {
    /** Time-to-live in seconds. Default: 300 (5 min). */
    ttlSeconds?: number;
    /** Metric name for targeted invalidation. */
    metricName: string;
    /** Parameters that affect the result (used for cache key computation). */
    params?: CacheParams;
}

export interface MartCacheEntry {
    martName: MartName;
    metricName: string;
    rangeStart?: string;
    rangeEnd?: string;
    comparisonStart?: string;
    comparisonEnd?: string;
    reportPeriodMode?: string;
    location?: string;
    category?: string;
    unitId?: number;
    result: unknown;
    ttlSeconds?: number;
}

export type MartName =
    | 'dashboard_kpi'
    | 'occupancy_by_location'
    | 'revenue_by_period'
    | 'expense_breakdown'
    | 'billing_breakdown'
    | 'checkin_busy_hours'
    | 'stay_duration'
    | 'weekday_weekend'
    | 'unit_performance';

// ═══════════════════════════════════════════════════════════════════════════════
// TTL Constants (re-exported from config/constants for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export const TTL = CACHE_TTL;

// ═══════════════════════════════════════════════════════════════════════════════
// CacheService
// ═══════════════════════════════════════════════════════════════════════════════

export class CacheService {
    /**
     * Retrieve a cached result by cache key.
     * Returns null if not found or expired (expires_at <= NOW()).
     */
    async getCachedResult<T = unknown>(cacheKey: string): Promise<T | null> {
        const rows = await queryAnalytics<{ result: T }>(
            `SELECT result
             FROM analytics_query_cache
             WHERE cache_key = $1 AND expires_at > NOW()`,
            [cacheKey]
        );
        return rows.length > 0 ? rows[0].result : null;
    }

    /**
     * Store a result in the query cache.
     * Uses the analytics_upsert_cache() SQL function for idempotency.
     */
    async setCachedResult<T = unknown>(
        cacheKey: string,
        metricName: string,
        params: CacheParams | null,
        result: T,
        ttlSeconds: number = TTL.DASHBOARD_TODAY
    ): Promise<void> {
        const paramsJson = params ? JSON.stringify(params) : null;
        const resultJson = JSON.stringify(result);

        await queryAnalytics(
            `SELECT analytics_upsert_cache($1, $2, $3::JSONB, $4::JSONB, $5)`,
            [cacheKey, metricName, paramsJson, resultJson, ttlSeconds]
        );
    }

    /**
     * Invalidate cache entries.
     *
     * - No args: invalidates ALL query cache entries.
     * - metricName only: invalidates entries with that metric_name.
     * - metricName + params: computes the cache key and deletes that specific entry.
     *
     * Returns the number of invalidated rows.
     */
    async invalidateCache(
        metricName?: string,
        params?: CacheParams
    ): Promise<number> {
        if (metricName && params) {
            // Targeted: compute exact key and delete
            const key = computeCacheKey(metricName, params);
            const result = await queryAnalytics<{ id: number }>(
                `DELETE FROM analytics_query_cache WHERE cache_key = $1 RETURNING id`,
                [key]
            );
            return result.length;
        }

        // Bulk: use the SQL function
        const rows = await queryAnalytics<{ analytics_invalidate_cache: number }>(
            `SELECT analytics_invalidate_cache($1::TEXT)`,
            [metricName ?? null]
        );
        return Number(rows[0]?.analytics_invalidate_cache ?? 0);
    }

    /**
     * Invalidate ALL cache entries (both query and mart tables).
     * Uses TRUNCATE for speed — use with care.
     */
    async invalidateAllCache(): Promise<void> {
        await queryAnalytics(`TRUNCATE TABLE analytics_query_cache`);
        await queryAnalytics(`TRUNCATE TABLE analytics_cache_mart`);
    }

    /**
     * Remove expired entries from both cache tables.
     * Useful for periodic cleanup to reclaim space.
     */
    async cleanExpired(): Promise<number> {
        const rows = await queryAnalytics<{ analytics_clean_expired: number }>(
            `SELECT analytics_clean_expired()`
        );
        return Number(rows[0]?.analytics_clean_expired ?? 0);
    }

    /**
     * Store a mart cache entry.
     * Uses analytics_upsert_mart() for idempotency.
     */
    async setMartResult(entry: MartCacheEntry): Promise<void> {
        const ttl = entry.ttlSeconds ?? TTL.MART_DEFAULT;

        await queryAnalytics(
            `SELECT analytics_upsert_mart(
                $1, $2, $3::DATE, $4::DATE,
                $5::DATE, $6::DATE,
                $7, $8, $9, $10::INTEGER,
                $11::JSONB, $12
            )`,
            [
                entry.martName,
                entry.metricName,
                entry.rangeStart ?? null,
                entry.rangeEnd ?? null,
                entry.comparisonStart ?? null,
                entry.comparisonEnd ?? null,
                entry.reportPeriodMode ?? 'calendar_day',
                entry.location ?? null,
                entry.category ?? null,
                entry.unitId ?? null,
                JSON.stringify(entry.result),
                ttl,
            ]
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════════

export const cacheService = new CacheService();

// ═══════════════════════════════════════════════════════════════════════════════
// Cache Key Computation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a deterministic cache key from metric name and params.
 *
 * Algorithm:
 *   1. Sort params keys alphabetically
 *   2. JSON.stringify the sorted object
 *   3. MD5 hash of `metricName|jsonString`
 *   4. Return `${metricName}_${hash}`
 */
export function computeCacheKey(metricName: string, params: CacheParams): string {
    const sorted = Object.keys(params)
        .sort()
        .reduce((acc: CacheParams, key: string) => {
            acc[key] = params[key];
            return acc;
        }, {});

    const hash = createHash('md5')
        .update(`${metricName}|${JSON.stringify(sorted)}`)
        .digest('hex');

    return `${metricName}_${hash}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// withCache() — core integration wrapper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generic cache-first wrapper for analytics queries.
 *
 * Flow:
 *   1. Computes cache key from metricName + params
 *   2. Checks analytics_query_cache for a valid (not expired) entry
 *   3. If hit → returns cached result immediately
 *   4. If miss → calls computeFn(), stores result via analytics_upsert_cache(), returns
 *
 * Storage is fire-and-forget (awaited but errors are logged, not thrown)
 * so a cache store failure never blocks the response.
 *
 * @param metricName  Logical grouping key for invalidation
 * @param params      Parameters that affect the result (sorted for deterministic key)
 * @param ttlSeconds  Time-to-live in seconds
 * @param computeFn   Async function that computes the actual result
 * @returns           The computed or cached result
 *
 * @example
 *   const revenue = await withCache('revenue_summary', { start, end }, TTL.DASHBOARD_MONTH, async () => {
 *       const rows = await queryAnalytics('SELECT ...', [start, end]);
 *       return processRows(rows);
 *   });
 */
export async function withCache<T>(
    metricName: string,
    params: CacheParams,
    ttlSeconds: number,
    computeFn: () => Promise<T>
): Promise<T> {
    const key = computeCacheKey(metricName, params);

    // 1. Check cache
    const cached = await cacheService.getCachedResult<T>(key);
    if (cached !== null) {
        return cached;
    }

    // 2. Cache miss — compute
    const result = await computeFn();

    // 3. Store (fire-and-forget)
    cacheService
        .setCachedResult(key, metricName, params, result, ttlSeconds)
        .catch((err) => {
            console.error(`[analytics-cache] Failed to store ${metricName}:`, err);
        });

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TTL Decision Helper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pick an appropriate TTL based on the date range.
 *
 * - Range ends before today (closed historical period):
 *     >90 days ago → 72h TTL
 *     ≤90 days ago → 24h TTL
 * - Range includes today or is in the future:
 *     ≤3 days span  → 5 min TTL (dashboard today)
 *     ≤14 days span → 15 min TTL (weekly)
 *     >14 days span → 30 min TTL (monthly)
 *
 * All dates treated as YYYY-MM-DD in Asia/Jakarta timezone.
 */
export function pickTTL(startDate: string, endDate: string): number {
    const now = new Date();
    const end = new Date(endDate + 'T23:59:59+07:00');

    // Closed historical period (range ends before today)
    if (end < now) {
        const daysAgo = Math.floor(
            (now.getTime() - end.getTime()) / 86_400_000
        );
        if (daysAgo > 90) return TTL.HISTORICAL_OLD; // 72h
        return TTL.HISTORICAL_CLOSED; // 24h
    }

    const start = new Date(startDate + 'T00:00:00+07:00');
    const rangeDays = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 86_400_000)
    );

    if (rangeDays <= 3) return TTL.DASHBOARD_TODAY; // 5 min
    if (rangeDays <= 14) return TTL.DASHBOARD_WEEK; // 15 min
    return TTL.DASHBOARD_MONTH; // 30 min
}
