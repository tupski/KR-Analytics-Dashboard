import { queryAnalytics } from './db';
import type { SyncStatus, SyncLogEntry } from './types';

/**
 * Fetch sync metadata for all tracked tables.
 * Includes the latest sync log entry per table.
 */
export async function getAllSyncStatuses(): Promise<SyncStatus[]> {
    return queryAnalytics<SyncStatus>(
        `SELECT
       sm.table_name,
       sm.last_sync_at,
       sm.row_count,
       sm.sync_status,
       sm.last_max_id,
       sm.backfill_done,
       sm.error_message,
       jsonb_build_object(
         'id',            sl.id,
         'table_name',    sl.table_name,
         'sync_type',     sl.sync_type,
         'status',        sl.status,
         'rows_synced',   sl.rows_synced,
         'rows_deleted',  sl.rows_deleted,
         'error_message', sl.error_message,
         'started_at',    sl.started_at,
         'completed_at',  sl.completed_at
       ) AS last_sync_log
     FROM sync_metadata sm
     LEFT JOIN LATERAL (
       SELECT *
       FROM sync_logs
       WHERE table_name = sm.table_name
       ORDER BY started_at DESC
       LIMIT 1
     ) sl ON TRUE
     ORDER BY sm.table_name`,
        []
    );
}

/**
 * Fetch sync status for a single table.
 */
export async function getSyncStatus(
    tableName: string
): Promise<SyncStatus | null> {
    const rows = await queryAnalytics<SyncStatus>(
        `SELECT
       sm.table_name,
       sm.last_sync_at,
       sm.row_count,
       sm.sync_status,
       sm.last_max_id,
       sm.backfill_done,
       sm.error_message,
       jsonb_build_object(
         'id',            sl.id,
         'table_name',    sl.table_name,
         'sync_type',     sl.sync_type,
         'status',        sl.status,
         'rows_synced',   sl.rows_synced,
         'rows_deleted',  sl.rows_deleted,
         'error_message', sl.error_message,
         'started_at',    sl.started_at,
         'completed_at',  sl.completed_at
       ) AS last_sync_log
     FROM sync_metadata sm
     LEFT JOIN LATERAL (
       SELECT *
       FROM sync_logs
       WHERE table_name = sm.table_name
       ORDER BY started_at DESC
       LIMIT 1
     ) sl ON TRUE
     WHERE sm.table_name = $1`,
        [tableName]
    );
    return rows[0] ?? null;
}

/**
 * Fetch recent sync log entries across all tables.
 */
export async function getRecentSyncLogs(
    limit: number = 20
): Promise<SyncLogEntry[]> {
    return queryAnalytics<SyncLogEntry>(
        `SELECT
       id,
       table_name,
       sync_type,
       status,
       rows_synced,
       rows_deleted,
       error_message,
       started_at,
       completed_at
     FROM sync_logs
     ORDER BY started_at DESC
     LIMIT $1`,
        [limit]
    );
}

/**
 * Fetch sync logs for a specific table.
 */
export async function getSyncLogsForTable(
    tableName: string,
    limit: number = 10
): Promise<SyncLogEntry[]> {
    return queryAnalytics<SyncLogEntry>(
        `SELECT
       id,
       table_name,
       sync_type,
       status,
       rows_synced,
       rows_deleted,
       error_message,
       started_at,
       completed_at
     FROM sync_logs
     WHERE table_name = $1
     ORDER BY started_at DESC
     LIMIT $2`,
        [tableName, limit]
    );
}
