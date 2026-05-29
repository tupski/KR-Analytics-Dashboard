/**
 * run-tagihan-fee-lunas-sync.ts
 * Standalone runner for tagihan_fee_lunas + tagihan_fee_lunas_items sync.
 *
 * Usage:
 *   cd sync-worker && npx tsx scripts/run-tagihan-fee-lunas-sync.ts --mode=backfill --table=all
 *   npx tsx scripts/run-tagihan-fee-lunas-sync.ts --mode=incremental --table=parent
 *   npx tsx scripts/run-tagihan-fee-lunas-sync.ts --mode=recent --table=items
 *   npx tsx scripts/run-tagihan-fee-lunas-sync.ts --mode=delete-detect --table=all
 *   npx tsx scripts/run-tagihan-fee-lunas-sync.ts --mode=full --table=all
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Use cwd-based path for tsx compatibility (__dirname unreliable in some tsx contexts)
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

import { getPool, closePool } from '../src/db';
import { getSupabaseClient } from '../src/supabase';
import { syncTagihanFeeLunasCombined } from '../src/sync/tagihan-fee-lunas';
import { getMetadata, updateMetadata } from '../src/sync/metadata';
import { config } from '../src/config';

const RECENT_WINDOW_DAYS = 14;
const TABLE_NAMES = ['tagihan_fee_lunas', 'tagihan_fee_lunas_items'] as const;

async function main() {
    const args = process.argv.slice(2);
    const modeFlag = args.find((a) => a.startsWith('--mode='));
    const tableFlag = args.find((a) => a.startsWith('--table='));
    const mode = modeFlag ? modeFlag.split('=')[1] : 'full';
    const table = tableFlag ? tableFlag.split('=')[1] : 'all';

    console.log(`[run:tagihan_fee_lunas] Mode: ${mode}, Table: ${table}`);

    const pool = getPool();
    const supabase = getSupabaseClient();

    try {
        // Ensure metadata rows exist for both tables
        for (const tbl of TABLE_NAMES) {
            let meta = await getMetadata(pool, tbl);
            if (!meta) {
                await updateMetadata(pool, tbl, { last_max_id: 0, backfill_done: false });
            }
        }

        if (mode === 'backfill') {
            if (table === 'all' || table === 'parent') {
                console.log('[run:tagihan_fee_lunas] Running parent backfill...');
                const rows = await backfillOnly(pool, supabase, 'tagihan_fee_lunas');
                console.log(`[run:tagihan_fee_lunas] Parent backfill: ${rows} rows`);
            }
            if (table === 'all' || table === 'items') {
                console.log('[run:tagihan_fee_lunas] Running items backfill...');
                const rows = await backfillOnly(pool, supabase, 'tagihan_fee_lunas_items');
                console.log(`[run:tagihan_fee_lunas] Items backfill: ${rows} rows`);
            }
        } else if (mode === 'incremental') {
            if (table === 'all' || table === 'parent') {
                const rows = await incrementalOnly(pool, supabase, 'tagihan_fee_lunas');
                console.log(`[run:tagihan_fee_lunas] Parent incremental: ${rows} rows`);
            }
            if (table === 'all' || table === 'items') {
                const rows = await incrementalOnly(pool, supabase, 'tagihan_fee_lunas_items');
                console.log(`[run:tagihan_fee_lunas] Items incremental: ${rows} rows`);
            }
        } else if (mode === 'recent') {
            if (table === 'all' || table === 'parent') {
                const rows = await recentOnly(pool, supabase, 'tagihan_fee_lunas');
                console.log(`[run:tagihan_fee_lunas] Parent recent: ${rows} rows`);
            }
            if (table === 'all' || table === 'items') {
                const rows = await recentOnly(pool, supabase, 'tagihan_fee_lunas_items');
                console.log(`[run:tagihan_fee_lunas] Items recent: ${rows} rows`);
            }
        } else if (mode === 'delete-detect') {
            if (table === 'all' || table === 'parent') {
                const rows = await deleteDetectOnly(pool, supabase, 'tagihan_fee_lunas');
                console.log(`[run:tagihan_fee_lunas] Parent delete-detect: ${rows} rows`);
            }
            if (table === 'all' || table === 'items') {
                const rows = await deleteDetectOnly(pool, supabase, 'tagihan_fee_lunas_items');
                console.log(`[run:tagihan_fee_lunas] Items delete-detect: ${rows} rows`);
            }
        } else if (mode === 'full') {
            console.log('[run:tagihan_fee_lunas] Running full combined sync...');
            const result = await syncTagihanFeeLunasCombined(pool, supabase);
            console.log(`[run:tagihan_fee_lunas] Parent: ${result.parent.rowsSynced} synced, ${result.parent.rowsDeleted} deleted in ${result.parent.durationMs}ms`);
            console.log(`[run:tagihan_fee_lunas] Items: ${result.items.rowsSynced} synced, ${result.items.rowsDeleted} deleted in ${result.items.durationMs}ms`);
        } else {
            console.error(`Unknown mode: ${mode}`);
            process.exit(1);
        }

        // Show final metadata
        for (const tbl of TABLE_NAMES) {
            const finalMeta = await getMetadata(pool, tbl);
            if (finalMeta) {
                console.log(`\n[run:tagihan_fee_lunas] ${tbl} metadata:`);
                console.log(JSON.stringify(finalMeta, null, 2));
            }
        }
    } catch (err) {
        console.error('[run:tagihan_fee_lunas] Failed:', err);
        process.exit(1);
    } finally {
        await closePool();
    }
}

// ─── Inline helpers for standalone mode ───

/** WIB date-only cutoff (for paid_at/due_date queries) */
function getWibCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(wibMs);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

/** WIB timestamp cutoff (for created_at queries) */
function getWibTimestampCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(wibMs);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
}

/** Build upsert SQL for a given table inline (standalone mode, not using main module) */
function buildUpsertSQL(tableName: string, rows: any[], columns: string[]): { sql: string; values: unknown[] } {
    const colCount = columns.length;
    const colList = [...columns, 'synced_at', 'is_deleted'].join(', ');
    const valuePlaceholders: string[] = [];
    const allValues: unknown[] = [];

    for (const row of rows) {
        const vals = columns.map((col) => {
            const v = row[col];
            // Serialize JSONB columns
            if (col === 'transactions_detail' && v !== null && typeof v === 'object') {
                return JSON.stringify(v);
            }
            return v ?? null;
        });
        const offset = allValues.length;
        allValues.push(...vals);
        const placeholders = Array.from({ length: colCount }, (_, i) => `$${offset + i + 1}`);
        valuePlaceholders.push(`(${placeholders.join(', ')}, NOW(), FALSE)`);
    }

    const updateClauses = columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

    const sql = `
        INSERT INTO ${tableName} (${colList})
        VALUES ${valuePlaceholders.join(',\n')}
        ON CONFLICT (id) DO UPDATE SET
          ${updateClauses},
          synced_at = NOW(),
          is_deleted = FALSE
    `.trim();

    return { sql, values: allValues };
}

async function upsertChunked(pool: any, tableName: string, rows: any[], columns: string[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { sql, values } = buildUpsertSQL(tableName, chunk, columns);
        await pool.query(sql, values);
    }
}

const PARENT_COLUMNS = ['id', 'marketing_name', 'customer_count', 'total_fee', 'transactions_detail', 'proof_url', 'paid_at', 'user_id', 'created_at', 'paid_date'];
const ITEMS_COLUMNS = ['id', 'transaction_id', 'marketing_name', 'fee_amount', 'paid_at', 'paid_date', 'paid_by', 'proof_url', 'created_at'];

function getColumns(tableName: string): string[] {
    return tableName === 'tagihan_fee_lunas' ? PARENT_COLUMNS : ITEMS_COLUMNS;
}

function getTimestampColumn(tableName: string): string {
    return tableName === 'tagihan_fee_lunas' ? 'paid_at' : 'created_at';
}

async function backfillOnly(pool: any, supabase: any, tableName: string): Promise<number> {
    const meta = await getMetadata(pool, tableName);
    if (meta?.backfill_done) {
        console.log(`[backfill:${tableName}] Already done, skipping`);
        return 0;
    }

    let lastSeenId = meta?.last_max_id ?? 0;
    let totalSynced = 0;
    const batchSize = config.syncBatchSize;
    const columns = getColumns(tableName);

    while (true) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) throw new Error(`[backfill:${tableName}] Fetch error: ${error.message}`);
        if (!data || data.length === 0) break;

        await upsertChunked(pool, tableName, data, columns);

        lastSeenId = data[data.length - 1].id;
        totalSynced += data.length;
        await updateMetadata(pool, tableName, { last_max_id: lastSeenId });
        console.log(`[backfill:${tableName}] Progress: ${totalSynced} rows, last_id=${lastSeenId}`);
        if (data.length < batchSize) break;
    }

    await updateMetadata(pool, tableName, { backfill_done: true });
    return totalSynced;
}

async function incrementalOnly(pool: any, supabase: any, tableName: string): Promise<number> {
    const meta = await getMetadata(pool, tableName);
    const lastMaxId = meta?.last_max_id ?? 0;
    const columns = getColumns(tableName);

    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .gt('id', lastMaxId)
        .order('id', { ascending: true })
        .limit(config.syncBatchSize);

    if (error) throw new Error(`[incremental:${tableName}] Fetch error: ${error.message}`);
    if (!data || data.length === 0) return 0;

    let allData = [...data];
    let currentMaxId = data[data.length - 1].id;

    while (data.length === config.syncBatchSize) {
        const { data: moreData, error: moreError } = await supabase
            .from(tableName)
            .select('*')
            .gt('id', currentMaxId)
            .order('id', { ascending: true })
            .limit(config.syncBatchSize);
        if (moreError || !moreData || moreData.length === 0) break;
        allData = allData.concat(moreData);
        currentMaxId = moreData[moreData.length - 1].id;
        if (moreData.length < config.syncBatchSize) break;
    }

    await upsertChunked(pool, tableName, allData, columns);
    await updateMetadata(pool, tableName, { last_max_id: currentMaxId });
    return allData.length;
}

async function recentOnly(pool: any, supabase: any, tableName: string): Promise<number> {
    const cutoffISO = getWibTimestampCutoff(RECENT_WINDOW_DAYS);
    const columns = getColumns(tableName);
    const tsCol = getTimestampColumn(tableName);

    let allData: any[] = [];
    let page = 0;
    const pageSize = config.syncBatchSize;

    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .gte(tsCol, cutoffISO)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) throw new Error(`[recent:${tableName}] Fetch error: ${error.message}`);
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        page++;
        if (data.length < pageSize) break;
    }

    if (allData.length === 0) return 0;
    await upsertChunked(pool, tableName, allData, columns);
    return allData.length;
}

async function deleteDetectOnly(pool: any, supabase: any, tableName: string): Promise<number> {
    const tsCol = getTimestampColumn(tableName);
    const cutoffDate = getWibCutoff(RECENT_WINDOW_DAYS);

    const localResult = await pool.query(
        `SELECT id FROM ${tableName} WHERE ${tsCol} >= $1 AND is_deleted = FALSE`,
        [cutoffDate]
    );
    const localIds = new Set<number>(localResult.rows.map((r: any) => r.id));
    if (localIds.size === 0) return 0;

    const productionIds = new Set<number>();
    let page = 0;
    const pageSize = config.syncBatchSize;

    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from(tableName)
            .select('id')
            .gte(tsCol, cutoffDate)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) throw new Error(`[delete-detect:${tableName}] Fetch error: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const row of data) productionIds.add(row.id);
        page++;
        if (data.length < pageSize) break;
    }

    const deletedIds: number[] = [];
    for (const id of localIds) {
        if (!productionIds.has(id)) deletedIds.push(id);
    }

    if (deletedIds.length === 0) return 0;

    const placeholders = deletedIds.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
        `UPDATE ${tableName} SET is_deleted = TRUE, synced_at = NOW() WHERE id IN (${placeholders})`,
        deletedIds
    );

    return deletedIds.length;
}

main();
