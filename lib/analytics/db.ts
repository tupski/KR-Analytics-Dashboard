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
        globalForAnalytics.analyticsPool = new Pool({ connectionString, max: 5 });
    }
    return globalForAnalytics.analyticsPool;
}

/**
 * Execute a read-only query against the analytics PostgreSQL database.
 * All queries MUST use parameterized placeholders ($1, $2, ...) — never string interpolation.
 */
export async function queryAnalytics<T = any>(
    text: string,
    params?: unknown[]
): Promise<T[]> {
    const pool = getAnalyticsPool();
    const result = await pool.query(text, params);
    return result.rows as T[];
}

/**
 * Gracefully close the connection pool. Call during shutdown / hot-reload.
 */
export async function closeAnalyticsPool(): Promise<void> {
    const pool = globalForAnalytics.analyticsPool;
    if (pool) {
        await pool.end();
        globalForAnalytics.analyticsPool = undefined;
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
