import { Pool } from 'pg';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { getMetadata, updateMetadata } from './metadata';
import { startSyncLog, completeSyncLog } from './logger';

const RECENT_WINDOW_DAYS = 14;

// ─── Parent: tagihan_fee_lunas ───

const PARENT_UPSERT_COLUMNS = [
    'id', 'marketing_name', 'customer_count', 'total_fee', 'transactions_detail',
    'proof_url', 'paid_at', 'user_id', 'created_at', 'paid_date',
] as const;

const PARENT_COL_COUNT = PARENT_UPSERT_COLUMNS.length; // 10

interface TagihanFeeLunasRow {
    id: number;
    marketing_name: string;
    customer_count: number;
    total_fee: number;
    transactions_detail: unknown | null;
    proof_url: string | null;
    paid_at: string;
    user_id: string | null;
    created_at: string;
    paid_date: string | null;
}

function parentRowToValues(row: TagihanFeeLunasRow): unknown[] {
    return [
        row.id, row.marketing_name, row.customer_count, row.total_fee,
        row.transactions_detail ? JSON.stringify(row.transactions_detail) : null,
        row.proof_url, row.paid_at, row.user_id, row.created_at, row.paid_date,
    ];
}

function buildParentUpsertSQLBatch(rows: TagihanFeeLunasRow[]): string {
    const colList = [...PARENT_UPSERT_COLUMNS, 'synced_at', 'is_deleted'].join(', ');
    const valuePlaceholders: string[] = [];
    const allValues: unknown[] = [];

    for (const row of rows) {
        const vals = parentRowToValues(row);
        const offset = allValues.length;
        allValues.push(...vals);
        const placeholders = Array.from({ length: PARENT_COL_COUNT }, (_, i) => `$${offset + i + 1}`);
        valuePlaceholders.push(`(${placeholders.join(', ')}, NOW(), FALSE)`);
    }

    const updateClauses = PARENT_UPSERT_COLUMNS.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

    return `
    INSERT INTO tagihan_fee_lunas (${colList})
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT (id) DO UPDATE SET
      ${updateClauses},
      synced_at = NOW(),
      is_deleted = FALSE
  `.trim();
}

async function upsertParentBatch(pool: Pool, rows: TagihanFeeLunasRow[]): Promise<void> {
    if (rows.length === 0) return;
    const sql = buildParentUpsertSQLBatch(rows);
    const values = rows.flatMap(parentRowToValues);
    await pool.query(sql, values);
}

// ─── Items: tagihan_fee_lunas_items ───

const ITEMS_UPSERT_COLUMNS = [
    'id', 'transaction_id', 'marketing_name', 'fee_amount', 'paid_at',
    'paid_date', 'paid_by', 'proof_url', 'created_at',
] as const;

const ITEMS_COL_COUNT = ITEMS_UPSERT_COLUMNS.length; // 9

interface TagihanFeeLunasItemsRow {
    id: number;
    transaction_id: number;
    marketing_name: string;
    fee_amount: number;
    paid_at: string;
    paid_date: string | null;
    paid_by: string;
    proof_url: string | null;
    created_at: string;
}

function itemsRowToValues(row: TagihanFeeLunasItemsRow): unknown[] {
    return [
        row.id, row.transaction_id, row.marketing_name, row.fee_amount,
        row.paid_at, row.paid_date, row.paid_by, row.proof_url, row.created_at,
    ];
}

function buildItemsUpsertSQLBatch(rows: TagihanFeeLunasItemsRow[]): string {
    const colList = [...ITEMS_UPSERT_COLUMNS, 'synced_at', 'is_deleted'].join(', ');
    const valuePlaceholders: string[] = [];
    const allValues: unknown[] = [];

    for (const row of rows) {
        const vals = itemsRowToValues(row);
        const offset = allValues.length;
        allValues.push(...vals);
        const placeholders = Array.from({ length: ITEMS_COL_COUNT }, (_, i) => `$${offset + i + 1}`);
        valuePlaceholders.push(`(${placeholders.join(', ')}, NOW(), FALSE)`);
    }

    const updateClauses = ITEMS_UPSERT_COLUMNS.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

    return `
    INSERT INTO tagihan_fee_lunas_items (${colList})
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT (id) DO UPDATE SET
      ${updateClauses},
      synced_at = NOW(),
      is_deleted = FALSE
  `.trim();
}

async function upsertItemsBatch(pool: Pool, rows: TagihanFeeLunasItemsRow[]): Promise<void> {
    if (rows.length === 0) return;
    const sql = buildItemsUpsertSQLBatch(rows);
    const values = rows.flatMap(itemsRowToValues);
    await pool.query(sql, values);
}

// ─── Shared: WIB helpers ───

function getWibCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    wibDate.setDate(wibDate.getDate() - daysAgo);
    return wibDate.toISOString().split('T')[0];
}

function getWibTimestampCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    wibDate.setDate(wibDate.getDate() - daysAgo);
    return wibDate.toISOString();
}

// ════════════════════════════════════════════════════════════════
// PARENT: tagihan_fee_lunas
// ════════════════════════════════════════════════════════════════

async function backfillParent(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'tagihan_fee_lunas');
    if (metadata?.backfill_done) {
        console.log('[sync:tagihan_fee_lunas] Backfill already done, skipping');
        return 0;
    }

    let lastSeenId = metadata?.last_max_id ?? 0;
    let totalSynced = 0;
    const batchSize = config.syncBatchSize;

    console.log(`[sync:tagihan_fee_lunas] Starting backfill from id > ${lastSeenId}`);

    while (true) {
        const { data, error } = await supabase
            .from('tagihan_fee_lunas')
            .select('*')
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) {
            throw new Error(`Supabase fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) {
            console.log(`[sync:tagihan_fee_lunas] Backfill complete: ${totalSynced} rows synced`);
            break;
        }

        for (let i = 0; i < data.length; i += 500) {
            const chunk = data.slice(i, i + 500);
            await upsertParentBatch(pool, chunk as TagihanFeeLunasRow[]);
        }

        lastSeenId = data[data.length - 1].id;
        totalSynced += data.length;

        await updateMetadata(pool, 'tagihan_fee_lunas', { last_max_id: lastSeenId });
        console.log(`[sync:tagihan_fee_lunas] Backfill progress: ${totalSynced} rows, last_id=${lastSeenId}`);

        if (data.length < batchSize) break;
    }

    await updateMetadata(pool, 'tagihan_fee_lunas', { backfill_done: true });
    return totalSynced;
}

async function syncNewParent(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'tagihan_fee_lunas');
    const lastMaxId = metadata?.last_max_id ?? 0;

    const { data, error } = await supabase
        .from('tagihan_fee_lunas')
        .select('*')
        .gt('id', lastMaxId)
        .order('id', { ascending: true })
        .limit(config.syncBatchSize);

    if (error) {
        throw new Error(`Supabase incremental fetch error: ${error.message}`);
    }

    if (!data || data.length === 0) return 0;

    let allData = [...data];
    let currentMaxId = data[data.length - 1].id;

    while (data.length === config.syncBatchSize) {
        const { data: moreData, error: moreError } = await supabase
            .from('tagihan_fee_lunas')
            .select('*')
            .gt('id', currentMaxId)
            .order('id', { ascending: true })
            .limit(config.syncBatchSize);

        if (moreError || !moreData || moreData.length === 0) break;
        allData = allData.concat(moreData);
        currentMaxId = moreData[moreData.length - 1].id;
        if (moreData.length < config.syncBatchSize) break;
    }

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        await upsertParentBatch(pool, chunk as TagihanFeeLunasRow[]);
    }

    await updateMetadata(pool, 'tagihan_fee_lunas', { last_max_id: currentMaxId });
    console.log(`[sync:tagihan_fee_lunas] Incremental: ${allData.length} new rows, last_id=${currentMaxId}`);
    return allData.length;
}

async function syncRecentParent(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const cutoffISO = getWibTimestampCutoff(RECENT_WINDOW_DAYS);

    let allData: TagihanFeeLunasRow[] = [];
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('tagihan_fee_lunas')
            .select('*')
            .gte('created_at', cutoffISO)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Supabase recent fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        allData = allData.concat(data as TagihanFeeLunasRow[]);
        page++;

        if (data.length < pageSize) break;
    }

    if (allData.length === 0) return 0;

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        await upsertParentBatch(pool, chunk);
    }

    console.log(`[sync:tagihan_fee_lunas] Recent re-scan: ${allData.length} rows upserted`);
    return allData.length;
}

async function detectDeletedParent(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const cutoffDate = getWibCutoff(RECENT_WINDOW_DAYS);

    // Use paid_at as temporal anchor (closest to "last modified")
    const localResult = await pool.query<{ id: number }>(
        `SELECT id FROM tagihan_fee_lunas WHERE paid_at >= $1 AND is_deleted = FALSE`,
        [cutoffDate]
    );
    const localIds = new Set<number>(localResult.rows.map((r) => r.id));

    if (localIds.size === 0) return 0;

    const productionIds = new Set<number>();
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('tagihan_fee_lunas')
            .select('id')
            .gte('paid_at', cutoffDate)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Supabase delete-detect fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        for (const row of data) {
            productionIds.add(row.id);
        }
        page++;
        if (data.length < pageSize) break;
    }

    const deletedIds: number[] = [];
    for (const id of localIds) {
        if (!productionIds.has(id)) {
            deletedIds.push(id);
        }
    }

    if (deletedIds.length === 0) return 0;

    const placeholders = deletedIds.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
        `UPDATE tagihan_fee_lunas SET is_deleted = TRUE, synced_at = NOW() WHERE id IN (${placeholders})`,
        deletedIds
    );

    console.log(`[sync:tagihan_fee_lunas] Marked ${deletedIds.length} rows as deleted`);
    return deletedIds.length;
}

// ════════════════════════════════════════════════════════════════
// ITEMS: tagihan_fee_lunas_items
// ════════════════════════════════════════════════════════════════

async function backfillItems(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'tagihan_fee_lunas_items');
    if (metadata?.backfill_done) {
        console.log('[sync:tagihan_fee_lunas_items] Backfill already done, skipping');
        return 0;
    }

    let lastSeenId = metadata?.last_max_id ?? 0;
    let totalSynced = 0;
    const batchSize = config.syncBatchSize;

    console.log(`[sync:tagihan_fee_lunas_items] Starting backfill from id > ${lastSeenId}`);

    while (true) {
        const { data, error } = await supabase
            .from('tagihan_fee_lunas_items')
            .select('*')
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) {
            throw new Error(`Supabase fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) {
            console.log(`[sync:tagihan_fee_lunas_items] Backfill complete: ${totalSynced} rows synced`);
            break;
        }

        for (let i = 0; i < data.length; i += 500) {
            const chunk = data.slice(i, i + 500);
            await upsertItemsBatch(pool, chunk as TagihanFeeLunasItemsRow[]);
        }

        lastSeenId = data[data.length - 1].id;
        totalSynced += data.length;

        await updateMetadata(pool, 'tagihan_fee_lunas_items', { last_max_id: lastSeenId });
        console.log(`[sync:tagihan_fee_lunas_items] Backfill progress: ${totalSynced} rows, last_id=${lastSeenId}`);

        if (data.length < batchSize) break;
    }

    await updateMetadata(pool, 'tagihan_fee_lunas_items', { backfill_done: true });
    return totalSynced;
}

async function syncNewItems(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'tagihan_fee_lunas_items');
    const lastMaxId = metadata?.last_max_id ?? 0;

    const { data, error } = await supabase
        .from('tagihan_fee_lunas_items')
        .select('*')
        .gt('id', lastMaxId)
        .order('id', { ascending: true })
        .limit(config.syncBatchSize);

    if (error) {
        throw new Error(`Supabase incremental fetch error: ${error.message}`);
    }

    if (!data || data.length === 0) return 0;

    let allData = [...data];
    let currentMaxId = data[data.length - 1].id;

    while (data.length === config.syncBatchSize) {
        const { data: moreData, error: moreError } = await supabase
            .from('tagihan_fee_lunas_items')
            .select('*')
            .gt('id', currentMaxId)
            .order('id', { ascending: true })
            .limit(config.syncBatchSize);

        if (moreError || !moreData || moreData.length === 0) break;
        allData = allData.concat(moreData);
        currentMaxId = moreData[moreData.length - 1].id;
        if (moreData.length < config.syncBatchSize) break;
    }

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        await upsertItemsBatch(pool, chunk as TagihanFeeLunasItemsRow[]);
    }

    await updateMetadata(pool, 'tagihan_fee_lunas_items', { last_max_id: currentMaxId });
    console.log(`[sync:tagihan_fee_lunas_items] Incremental: ${allData.length} new rows, last_id=${currentMaxId}`);
    return allData.length;
}

async function syncRecentItems(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const cutoffISO = getWibTimestampCutoff(RECENT_WINDOW_DAYS);

    let allData: TagihanFeeLunasItemsRow[] = [];
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('tagihan_fee_lunas_items')
            .select('*')
            .gte('created_at', cutoffISO)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Supabase recent fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        allData = allData.concat(data as TagihanFeeLunasItemsRow[]);
        page++;

        if (data.length < pageSize) break;
    }

    if (allData.length === 0) return 0;

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        await upsertItemsBatch(pool, chunk);
    }

    console.log(`[sync:tagihan_fee_lunas_items] Recent re-scan: ${allData.length} rows upserted`);
    return allData.length;
}

async function detectDeletedItems(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const cutoffISO = getWibTimestampCutoff(RECENT_WINDOW_DAYS);

    // Items have no updated_at; use created_at for temporal anchor
    const localResult = await pool.query<{ id: number }>(
        `SELECT id FROM tagihan_fee_lunas_items WHERE created_at >= $1 AND is_deleted = FALSE`,
        [cutoffISO]
    );
    const localIds = new Set<number>(localResult.rows.map((r) => r.id));

    if (localIds.size === 0) return 0;

    const productionIds = new Set<number>();
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('tagihan_fee_lunas_items')
            .select('id')
            .gte('created_at', cutoffISO)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Supabase delete-detect fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        for (const row of data) {
            productionIds.add(row.id);
        }
        page++;
        if (data.length < pageSize) break;
    }

    const deletedIds: number[] = [];
    for (const id of localIds) {
        if (!productionIds.has(id)) {
            deletedIds.push(id);
        }
    }

    if (deletedIds.length === 0) return 0;

    const placeholders = deletedIds.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
        `UPDATE tagihan_fee_lunas_items SET is_deleted = TRUE, synced_at = NOW() WHERE id IN (${placeholders})`,
        deletedIds
    );

    console.log(`[sync:tagihan_fee_lunas_items] Marked ${deletedIds.length} items as deleted`);
    return deletedIds.length;
}

// ════════════════════════════════════════════════════════════════
// MAIN EXPORTED FUNCTIONS
// ════════════════════════════════════════════════════════════════

/** Sync parent tagihan_fee_lunas only (full cycle with backfill/incremental/recent/delete) */
export async function syncTagihanFeeLunas(
    pool: Pool,
    supabase: SupabaseClient
): Promise<{ rowsSynced: number; rowsDeleted: number; durationMs: number }> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'tagihan_fee_lunas', 'full');

    try {
        const metadata = await getMetadata(pool, 'tagihan_fee_lunas');
        let rowsSynced = 0;
        let rowsDeleted = 0;

        if (!metadata || !metadata.backfill_done) {
            rowsSynced = await backfillParent(pool, supabase);
        } else {
            const newCount = await syncNewParent(pool, supabase);
            const recentCount = await syncRecentParent(pool, supabase);
            rowsSynced = newCount + recentCount;
            rowsDeleted = await detectDeletedParent(pool, supabase);
        }

        const countResult = await pool.query('SELECT COUNT(*) as cnt FROM tagihan_fee_lunas');
        const rowCount = parseInt(countResult.rows[0]?.cnt || '0', 10);

        await updateMetadata(pool, 'tagihan_fee_lunas', {
            last_sync_at: new Date(),
            row_count: rowCount,
            sync_status: 'ok',
            error_message: null,
        });

        const durationMs = Date.now() - startTime;
        await completeSyncLog(pool, logId, 'success', rowsSynced, rowsDeleted);

        return { rowsSynced, rowsDeleted, durationMs };
    } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);

        await updateMetadata(pool, 'tagihan_fee_lunas', {
            sync_status: 'error',
            error_message: errorMsg,
        }).catch(() => { });

        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });

        throw err;
    }
}

/** Sync items tagihan_fee_lunas_items only (full cycle — no delete detection, items are append-only) */
export async function syncTagihanFeeLunasItems(
    pool: Pool,
    supabase: SupabaseClient
): Promise<{ rowsSynced: number; rowsDeleted: number; durationMs: number }> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'tagihan_fee_lunas_items', 'full');

    try {
        const metadata = await getMetadata(pool, 'tagihan_fee_lunas_items');
        let rowsSynced = 0;
        let rowsDeleted = 0;

        if (!metadata || !metadata.backfill_done) {
            rowsSynced = await backfillItems(pool, supabase);
        } else {
            const newCount = await syncNewItems(pool, supabase);
            const recentCount = await syncRecentItems(pool, supabase);
            rowsSynced = newCount + recentCount;
            // Items are append-only per UNIQUE(transaction_id).
            // Delete detection via created_at window produces false positives
            // because items created_at is a single timestamp, not updated.
            // Items lifecycle follows parent transactions — skip delete-detect.
        }

        const countResult = await pool.query('SELECT COUNT(*) as cnt FROM tagihan_fee_lunas_items');
        const rowCount = parseInt(countResult.rows[0]?.cnt || '0', 10);

        await updateMetadata(pool, 'tagihan_fee_lunas_items', {
            last_sync_at: new Date(),
            row_count: rowCount,
            sync_status: 'ok',
            error_message: null,
        });

        const durationMs = Date.now() - startTime;
        await completeSyncLog(pool, logId, 'success', rowsSynced, rowsDeleted);

        return { rowsSynced, rowsDeleted, durationMs };
    } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);

        await updateMetadata(pool, 'tagihan_fee_lunas_items', {
            sync_status: 'error',
            error_message: errorMsg,
        }).catch(() => { });

        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });

        throw err;
    }
}

/** Combined sync: parent THEN items. Used by index.ts and standalone runner. */
export async function syncTagihanFeeLunasCombined(
    pool: Pool,
    supabase: SupabaseClient
): Promise<{
    parent: { rowsSynced: number; rowsDeleted: number; durationMs: number };
    items: { rowsSynced: number; rowsDeleted: number; durationMs: number };
}> {
    console.log('[sync:tagihan_fee_lunas_combined] Syncing parent first...');
    const parent = await syncTagihanFeeLunas(pool, supabase);
    console.log(`[sync:tagihan_fee_lunas_combined] Parent done: ${parent.rowsSynced} synced, ${parent.rowsDeleted} deleted in ${parent.durationMs}ms`);

    console.log('[sync:tagihan_fee_lunas_combined] Syncing items...');
    const items = await syncTagihanFeeLunasItems(pool, supabase);
    console.log(`[sync:tagihan_fee_lunas_combined] Items done: ${items.rowsSynced} synced, ${items.rowsDeleted} deleted in ${items.durationMs}ms`);

    return { parent, items };
}
