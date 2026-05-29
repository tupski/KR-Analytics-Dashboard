import { Pool } from 'pg';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { getMetadata, updateMetadata } from './metadata';
import { startSyncLog, completeSyncLog } from './logger';

// ─── Master Table Config ────────────────────────────────────────────
interface MasterTableConfig {
    tableName: string;
    columns: string[]; // columns to SELECT from production and UPSERT into local
}

const MASTER_TABLES: MasterTableConfig[] = [
    {
        tableName: 'nomor_kamar',
        columns: ['id', 'name', 'lokasi', 'status', 'created_at'],
    },
    {
        tableName: 'lokasi_apartemen',
        columns: ['id', 'name', 'created_at', 'total_rooms'],
    },
    {
        tableName: 'pengeluaran_categories',
        columns: ['id', 'name', 'is_default', 'created_at'],
    },
    {
        tableName: 'karyawan_list',
        columns: ['id', 'name', 'created_at'],
    },
    {
        tableName: 'marketing_list',
        columns: ['id', 'name', 'created_at'],
    },
];

// ─── Per-table sync (full re-scan) ──────────────────────────────────

/**
 * Full re-scan for a single master table.
 * 1. Fetch ALL rows from production (no WHERE — tables are small)
 * 2. Upsert into local in batches
 * 3. Mark is_deleted = TRUE for local rows not in the fetched set
 */
async function syncMasterTable(
    pool: Pool,
    supabase: SupabaseClient,
    cfg: MasterTableConfig
): Promise<{ rowsSynced: number; rowsDeleted: number; durationMs: number }> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, cfg.tableName, 'full');

    try {
        // ── Step 1: Fetch ALL production rows ──
        const { data: prodRows, error } = await supabase
            .from(cfg.tableName)
            .select(cfg.columns.join(', '));

        if (error) {
            throw new Error(`Supabase fetch error [${cfg.tableName}]: ${error.message}`);
        }

        const rows = (prodRows || []) as unknown as Record<string, unknown>[];
        console.log(`[sync:master] ${cfg.tableName}: fetched ${rows.length} rows from production`);

        // ── Step 2: Upsert in batches ──
        const colCount = cfg.columns.length;
        const batchSize = 500;

        for (let i = 0; i < rows.length; i += batchSize) {
            const chunk = rows.slice(i, i + batchSize);
            const colList = [...cfg.columns, 'synced_at', 'is_deleted'].join(', ');

            const valuePlaceholders: string[] = [];
            const allValues: unknown[] = [];

            for (const row of chunk) {
                const vals = cfg.columns.map((col) => row[col]);
                const offset = allValues.length;
                const placeholders = Array.from(
                    { length: colCount },
                    (_, j) => `$${offset + j + 1}`
                );
                valuePlaceholders.push(`(${placeholders.join(', ')}, NOW(), FALSE)`);
                allValues.push(...vals);
            }

            const updateClauses = cfg.columns.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

            const sql = `
                INSERT INTO ${cfg.tableName} (${colList})
                VALUES ${valuePlaceholders.join(',\n')}
                ON CONFLICT (id) DO UPDATE SET
                    ${updateClauses},
                    synced_at = NOW(),
                    is_deleted = FALSE
            `.trim();

            await pool.query(sql, allValues);
        }

        // ── Step 3: Mark deleted local rows not in production ──
        const prodIds = new Set<number>();
        for (const row of rows) {
            const id = row['id'];
            if (typeof id === 'number') prodIds.add(id);
        }

        const deleteResult = await pool.query(
            `UPDATE ${cfg.tableName}
             SET is_deleted = TRUE, synced_at = NOW()
             WHERE is_deleted = FALSE AND id <> ALL($1::int[])`,
            [prodIds.size > 0 ? [...prodIds] : [0]]
        );
        const rowsDeleted = deleteResult.rowCount ?? 0;

        if (rowsDeleted > 0) {
            console.log(`[sync:master] ${cfg.tableName}: marked ${rowsDeleted} rows as deleted`);
        }

        // ── Update metadata ──
        const countResult = await pool.query(
            `SELECT COUNT(*) as cnt FROM ${cfg.tableName} WHERE is_deleted = FALSE`
        );
        const rowCount = parseInt(countResult.rows[0]?.cnt || '0', 10);

        await updateMetadata(pool, cfg.tableName, {
            last_sync_at: new Date(),
            row_count: rowCount,
            sync_status: 'ok',
            error_message: null,
        });

        const durationMs = Date.now() - startTime;
        await completeSyncLog(pool, logId, 'success', rows.length, rowsDeleted);

        console.log(
            `[sync:master] ${cfg.tableName}: ${rows.length} upserted, ${rowsDeleted} deleted in ${durationMs}ms`
        );

        return { rowsSynced: rows.length, rowsDeleted, durationMs };
    } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);

        await updateMetadata(pool, cfg.tableName, {
            sync_status: 'error',
            error_message: errorMsg,
        }).catch(() => { });

        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });

        throw err;
    }
}

// ─── Main export ────────────────────────────────────────────────────

export interface MasterSyncResult {
    status: string;
    tables: Array<{
        tableName: string;
        rowsSynced: number;
        rowsDeleted: number;
        durationMs: number;
    }>;
}

export async function syncMasterTables(
    pool: Pool,
    supabase: SupabaseClient
): Promise<MasterSyncResult> {
    const results: MasterSyncResult['tables'] = [];

    for (const cfg of MASTER_TABLES) {
        const result = await syncMasterTable(pool, supabase, cfg);
        results.push({ tableName: cfg.tableName, ...result });
    }

    return { status: 'success', tables: results };
}
