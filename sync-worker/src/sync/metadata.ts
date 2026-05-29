import { Pool } from 'pg';

export interface SyncMetadata {
    table_name: string;
    last_sync_at: Date;
    last_max_id: number | null;
    row_count: number;
    sync_status: string;
    error_message: string | null;
    backfill_done: boolean;
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
