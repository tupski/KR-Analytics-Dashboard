export const config = {
    // Supabase (production — READ ONLY)
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

    // Local PostgreSQL
    localDbHost: process.env.LOCAL_DB_HOST || 'localhost',
    localDbPort: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
    localDbName: process.env.LOCAL_DB_NAME || 'kr_analytics',
    localDbUser: process.env.LOCAL_DB_USER || 'analytics',
    localDbPassword: process.env.LOCAL_DB_PASSWORD || 'analytics_dev_password',

    // Sync config
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10), // 5 min
    syncBatchSize: parseInt(process.env.SYNC_BATCH_SIZE || '1000', 10),
    syncLookbackDays: parseInt(process.env.SYNC_LOOKBACK_DAYS || '30', 10),
    // Re-scan window for updates-only each cycle. Production tables have NO
    // updated_at column/trigger yet, so this is a window-reduction fallback:
    // only recent rows are re-fetched per cycle instead of the full lookback.
    syncRecentWindowDays: parseInt(process.env.SYNC_RECENT_WINDOW_DAYS || '14', 10),
    // Daily backstop: when last_sync_at is older than this, run a full
    // syncLookbackDays re-scan + delete scan to catch edits/deletes missed by
    // the narrow window (guarantees eventual consistency without updated_at).
    fullRescanIntervalMs: parseInt(process.env.FULL_RESCAN_INTERVAL_MS || '86400000', 10), // 24h

    // Health server
    healthPort: parseInt(process.env.SYNC_WORKER_PORT || '9090', 10),

    // Cache invalidation after sync
    cacheInvalidateOnSync: process.env.CACHE_INVALIDATE_ON_SYNC !== 'false',
    martRefreshMode: (process.env.MART_REFRESH_MODE || 'partial') as 'none' | 'partial' | 'full',
} as const;
