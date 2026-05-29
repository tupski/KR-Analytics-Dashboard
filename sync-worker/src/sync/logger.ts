import { Pool } from 'pg';

export async function startSyncLog(
    pool: Pool,
    tableName: string,
    syncType: 'full' | 'incremental' | 'summary'
): Promise<number> {
    const result = await pool.query(
        `INSERT INTO sync_logs (table_name, sync_type, started_at, status)
     VALUES ($1, $2, NOW(), 'running')
     RETURNING id`,
        [tableName, syncType]
    );
    return result.rows[0].id;
}

export async function completeSyncLog(
    pool: Pool,
    logId: number,
    status: 'success' | 'error',
    rowsSynced: number,
    rowsDeleted: number = 0,
    errorMessage?: string
): Promise<void> {
    const durationResult = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 as duration_ms FROM sync_logs WHERE id = $1`,
        [logId]
    );
    const durationMs = Math.round(durationResult.rows[0]?.duration_ms || 0);

    await pool.query(
        `UPDATE sync_logs SET
      completed_at = NOW(),
      status = $1,
      rows_synced = $2,
      rows_deleted = $3,
      error_message = $4,
      duration_ms = $5
     WHERE id = $6`,
        [status, rowsSynced, rowsDeleted, errorMessage || null, durationMs, logId]
    );
}
