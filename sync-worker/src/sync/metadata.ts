import { Pool } from 'pg';
import { config } from '../config';

export interface SyncMetadata {
    table_name: string;
    last_sync_at: Date;
    last_max_id: number | null;
    row_count: number;
    sync_status: string;
    error_message: string | null;
    backfill_done: boolean;
    /** Optional: date range start for summary table refresh */
    summary_refresh_range_start?: string;
    /** Optional: last refresh time for summary tables */
    summary_last_refresh_at?: Date;
    /** Optional: last full re-scan (daily backstop) time */
    last_full_rescan_at?: Date | null;
}

/**
 * Daily backstop check. Production tables have no updated_at column yet,
 * so the narrow per-cycle re-scan window can miss edits/deletes. When the
 * last full re-scan is older than FULL_RESCAN_INTERVAL_MS, the cycle widens
 * the re-scan + delete-scan windows to the full lookback.
 * ponytail: once production tables gain updated_at + trigger, replace this
 * with a true last_updated_at watermark per table (no full re-scan needed).
 */
export function isFullRescanDue(metadata: SyncMetadata | null): boolean {
    if (!metadata?.last_full_rescan_at) return true;
    return Date.now() - new Date(metadata.last_full_rescan_at).getTime() >= config.fullRescanIntervalMs;
}

export async function getMetadata(pool: Pool, tableName: string): Promise<SyncMetadata | null> {
    const result = await pool.query(
        'SELECT * FROM sync_metadata WHERE table_name = $1',
        [tableName]
    );
    return result.rows[0] || null;
}

export async function updateMetadata(
    pool: Pool,
    tableName: string,
    updates: {
        last_sync_at?: Date;
        last_max_id?: number | null;
        row_count?: number;
        sync_status?: string;
        error_message?: string | null;
        backfill_done?: boolean;
        last_full_rescan_at?: Date | null;
    }
): Promise<void> {
    const setClauses: string[] = [];
    const insertCols: string[] = ['table_name'];
    const insertVals: string[] = ['$1'];
    const values: unknown[] = [tableName];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
        setClauses.push(`${key} = $${paramIndex}`);
        insertCols.push(key);
        insertVals.push(`$${paramIndex}`);
        values.push(value);
        paramIndex++;
    }

    setClauses.push(`updated_at = NOW()`);
    insertCols.push('updated_at');
    insertVals.push('NOW()');

    await pool.query(
        `INSERT INTO sync_metadata (${insertCols.join(', ')})
         VALUES (${insertVals.join(', ')})
         ON CONFLICT (table_name) DO UPDATE SET ${setClauses.join(', ')}`,
        values
    );
}
