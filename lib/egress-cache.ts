/**
 * ============================================================
 * App-level egress cache (P1 egress optimization, subtask 2)
 * ============================================================
 *
 * Deviation from plans/supabase-egress-optimization.md §3:
 * the plan proposed `analytics_query_cache` (local Postgres) via
 * lib/analytics/cache.ts withCache(). ANALYTICS_DATABASE_URL is
 * NOT set in this deployment, so lib/analytics/* never runs and
 * the PG-backed cache is dead code here. This module implements
 * the same TTL-cache strategy as an in-process module cache.
 *
 * SAFETY:
 * - This cache ONLY dedups repeated fetches within a TTL window.
 *   Every cache MISS still executes the caller's RLS-scoped
 *   Supabase query with the authenticated user's token, so
 *   authorization is never bypassed.
 * - Only use for queries whose RLS output is identical for all
 *   authenticated users (verified: transactions / pengeluaran /
 *   tagihan_bulanan / tagihan_fee_lunas_items SELECT policies are
 *   keyed on auth.role() = 'authenticated' — no per-user filter).
 *   Do NOT cache user-scoped rows.
 * - In-memory, per server instance/process. NOT a replacement for
 *   a real shared cache (e.g. Redis). Short TTLs keep the
 *   staleness window negligible.
 *
 * EVICTION: simple LRU-ish — Map preserves insertion order; when
 * at capacity the oldest (least recently set) entry is dropped.
 * Expired entries are dropped lazily on access.
 */

const MAX_ENTRIES = 200;

interface CacheEntry<T> {
    value: T;
    expiresAt: number; // epoch ms
}

const store = new Map<string, CacheEntry<unknown>>();

/** Read a cached value. Returns undefined on miss or TTL expiry. */
export function getCached<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return entry.value as T;
}

/** Store a value with a TTL in milliseconds. */
export function setCached<T>(key: string, value: T, ttlMs: number): void {
    if (store.size >= MAX_ENTRIES && !store.has(key)) {
        // Drop oldest entry (Map iteration is insertion-ordered).
        const oldestKey = store.keys().next().value;
        if (oldestKey !== undefined) store.delete(oldestKey);
    }
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Execute `fn` on cache miss and cache the result for `ttlMs`.
 * `fn` must be RLS-safe and return JSON-serializable data.
 */
export async function withEgressCache<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
): Promise<T> {
    const cached = getCached<T>(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    setCached(key, value, ttlMs);
    return value;
}

/** Expose current entry count (diagnostics / tests only). */
export function cacheSize(): number {
    return store.size;
}

/** Clear the whole cache (diagnostics / tests only). */
export function clearEgressCache(): void {
    store.clear();
}

/**
 * Build a collision-safe cache key from table + period bounds.
 * The exact date strings are included so two different ranges can
 * never share an entry.
 *
 * FIXED: URL-safe encoding to prevent cache key collisions from special characters.
 */
export function egressCacheKey(
    table: string,
    kind: string,
    ...bounds: Array<string | number | undefined | null>
): string {
    const encodedBounds = bounds.map(b =>
        b === null || b === undefined ? 'null' : encodeURIComponent(String(b))
    );
    return `egress:${encodeURIComponent(table)}:${encodeURIComponent(kind)}:${encodedBounds.join('|')}`;
}
