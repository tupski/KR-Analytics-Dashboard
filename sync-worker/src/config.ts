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

    // Health server
    healthPort: parseInt(process.env.SYNC_WORKER_PORT || '9090', 10),

    // Cache invalidation after sync
    cacheInvalidateOnSync: process.env.CACHE_INVALIDATE_ON_SYNC !== 'false',
    martRefreshMode: (process.env.MART_REFRESH_MODE || 'partial') as 'none' | 'partial' | 'full',
} as const;
