import { Pool } from 'pg';

const globalForAnalytics = globalThis as unknown as {
    analyticsPool: Pool | undefined;
};

function getAnalyticsPool(): Pool {
    if (!globalForAnalytics.analyticsPool) {
        const connectionString = process.env.ANALYTICS_DATABASE_URL;
        if (!connectionString) {
            throw new Error(
                'ANALYTICS_DATABASE_URL environment variable is required. ' +
                'Set it to the connection string of your local analytics PostgreSQL database.'
            );
        }
        globalForAnalytics.analyticsPool = new Pool({
            connectionString,
            max: 5,
            // Connection timeout in ms
            connectionTimeoutMillis: 10000,
            // Statement timeout in ms
            statement_timeout: 30000,
        });

        // ═══════════════════════════════════════════════════════════
        // Connection Pool Management — Development Mode Cleanup
        // ═══════════════════════════════════════════════════════════

        if (process.env.NODE_ENV === 'development') {
            // Cleanup on process exit
            process.on('exit', () => {
                globalForAnalytics.analyticsPool?.end().catch(() => { });
            });

            // Cleanup on SIGTERM (Docker / graceful shutdown)
            process.on('SIGTERM', async () => {
                await globalForAnalytics.analyticsPool?.end();
                process.exit(0);
            });

            // Cleanup on SIGINT (Ctrl+C)
            process.on('SIGINT', async () => {
                await globalForAnalytics.analyticsPool?.end();
                process.exit(0);
            });

            // Log connection events in development
            globalForAnalytics.analyticsPool.on('error', (err) => {
                console.error('[analytics-db] Unexpected pool error:', err.message);
            });
            globalForAnalytics.analyticsPool.on('connect', () => {
                console.debug('[analytics-db] New client connected');
            });
            globalForAnalytics.analyticsPool.on('release', () => {
                console.debug('[analytics-db] Client released back to pool');
            });
        }
    }
    return globalForAnalytics.analyticsPool;
}

/**
 * Execute a read-only query against the analytics PostgreSQL database.
 * All queries MUST use parameterized placeholders ($1, $2, ...) — never string interpolation.
 *
 * Includes automatic retry with exponential backoff for transient failures.
 */
export async function queryAnalytics<T = any>(
    text: string,
    params?: unknown[],
    maxRetries: number = 3,
): Promise<T[]> {
    const pool = getAnalyticsPool();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await pool.query(text, params);
            return result.rows as T[];
        } catch (error) {
            const isTransient = isTransientDbError(error);

            if (!isTransient || attempt === maxRetries - 1) {
                throw error;
            }

            // Exponential backoff: 1s, 2s, 4s
            const delayMs = 1000 * 2 ** attempt;
            console.warn(
                `[queryAnalytics] Transient error on attempt ${attempt + 1}/${maxRetries}, retrying in ${delayMs}ms:`,
                error instanceof Error ? error.message : String(error),
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    // Should never reach here, but TypeScript needs a return
    throw new Error('Query failed after retries');
}

/**
 * Check if a database error is transient and worth retrying
 */
function isTransientDbError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const msg = error.message.toLowerCase();
    // PostgreSQL error codes for transient failures:
    // - Connection errors: connection reset, connection refused, ECONNRESET, ECONNREFUSED
    // - Pool exhaustion: too many clients, remaining connection slots
    // - Deadlocks: deadlock detected
    // - Serialization failures: could not serialize access
    // - Network timeouts: timeout, canceling statement
    const transientPatterns = [
        'connection',
        'econnreset',
        'econnrefused',
        'too many clients',
        'remaining connection slots',
        'deadlock',
        'could not serialize',
        'canceling statement',
        'timeout',
        'network',
        'socket',
    ];

    return transientPatterns.some((pattern) => msg.includes(pattern));
}

/**
 * Gracefully close the connection pool. Call during shutdown / hot-reload.
 *
 * Used by:
 * - Development hot-reload (Next.js server restart)
 * - Production graceful shutdown (SIGTERM handler)
 */
export async function closeAnalyticsPool(): Promise<void> {
    const pool = globalForAnalytics.analyticsPool;
    if (pool) {
        console.log('[analytics-db] Closing connection pool...');
        await pool.end();
        globalForAnalytics.analyticsPool = undefined;
        console.log('[analytics-db] Connection pool closed');
    }
}

/**
 * Check if the analytics database pool is initialized and healthy.
 * Returns false if pool is not initialized or connection fails.
 */
export async function isAnalyticsDbHealthy(): Promise<boolean> {
    try {
        const pool = globalForAnalytics.analyticsPool;
        if (!pool) return false;

        const result = await pool.query('SELECT 1');
        return result.rows.length === 1;
    } catch {
        return false;
    }
}

/**
 * Safely parse a PostgreSQL NUMERIC value (returned as string by pg)
 * to a JavaScript number. Returns 0 for null/undefined/non-numeric.
 */
export function parseNumeric(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

/**
 * Parse nullable numeric — returns null when value is null/undefined.
 */
export function parseNullableNumeric(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    return parseNumeric(value);
}
