import { Pool } from 'pg';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { getMetadata, updateMetadata } from './metadata';
import { startSyncLog, completeSyncLog } from './logger';

const RECENT_WINDOW_DAYS = 14;

const UPSERT_COLUMNS = [
    'id', 'apartment_location', 'room_number', 'amount', 'due_date',
    'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
    'is_recurring', 'recurring_parent_id',
] as const;

const COL_COUNT = UPSERT_COLUMNS.length; // 12

interface TagihanBulananRow {
    id: number;
    apartment_location: string;
    room_number: string;
    amount: number;
    due_date: string;
    status: string | null;
    paid_at: string | null;
    proof_url: string | null;
    user_id: string | null;
    created_at: string | null;
    is_recurring: boolean | null;
    recurring_parent_id: number | null;
}

function rowToValues(row: TagihanBulananRow): unknown[] {
    return [
        row.id, row.apartment_location, row.room_number, row.amount, row.due_date,
        row.status, row.paid_at, row.proof_url, row.user_id, row.created_at,
        row.is_recurring, row.recurring_parent_id,
    ];
}

function buildUpsertSQLBatch(rows: TagihanBulananRow[]): string {
    const colList = [...UPSERT_COLUMNS, 'synced_at', 'is_deleted'].join(', ');
    const valuePlaceholders: string[] = [];
    const allValues: unknown[] = [];

    for (const row of rows) {
        const vals = rowToValues(row);
        const offset = allValues.length;
        allValues.push(...vals);
        const placeholders = Array.from({ length: COL_COUNT }, (_, i) => `$${offset + i + 1}`);
        valuePlaceholders.push(`(${placeholders.join(', ')}, NOW(), FALSE)`);
    }

    const updateClauses = UPSERT_COLUMNS.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

    const sql = `
    INSERT INTO tagihan_bulanan (${colList})
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT (id) DO UPDATE SET
      ${updateClauses},
      synced_at = NOW(),
      is_deleted = FALSE
  `.trim();

    return sql;
}

async function upsertBatch(pool: Pool, rows: TagihanBulananRow[]): Promise<void> {
    if (rows.length === 0) return;
    const sql = buildUpsertSQLBatch(rows);
    const values = rows.flatMap(rowToValues);
    await pool.query(sql, values);
}

/**
 * Get cutoff date string (YYYY-MM-DD) in WIB for Supabase queries.
 * Uses (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE logic.
 */
function getWibCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    wibDate.setDate(wibDate.getDate() - daysAgo);
    return wibDate.toISOString().split('T')[0];
}

/**
 * Get WIB timestamp string for ISO comparison (used for created_at queries).
 */
function getWibTimestampCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    wibDate.setDate(wibDate.getDate() - daysAgo);
    return wibDate.toISOString();
}

// --- Backfill ---
async function backfillTagihanBulanan(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'tagihan_bulanan');
    if (metadata?.backfill_done) {
        console.log('[sync:tagihan_bulanan] Backfill already done, skipping');
        return 0;
    }

    let lastSeenId = metadata?.last_max_id ?? 0;
    let totalSynced = 0;
    const batchSize = config.syncBatchSize;

    console.log(`[sync:tagihan_bulanan] Starting backfill from id > ${lastSeenId}`);

    while (true) {
        const { data, error } = await supabase
            .from('tagihan_bulanan')
            .select('*')
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) {
            throw new Error(`Supabase fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) {
            console.log(`[sync:tagihan_bulanan] Backfill complete: ${totalSynced} rows synced`);
            break;
        }

        // Upsert in chunks of 500
        for (let i = 0; i < data.length; i += 500) {
            const chunk = data.slice(i, i + 500);
            await upsertBatch(pool, chunk as TagihanBulananRow[]);
        }

        lastSeenId = data[data.length - 1].id;
        totalSynced += data.length;

        await updateMetadata(pool, 'tagihan_bulanan', { last_max_id: lastSeenId });
        console.log(`[sync:tagihan_bulanan] Backfill progress: ${totalSynced} rows, last_id=${lastSeenId}`);

        if (data.length < batchSize) break;
    }

    await updateMetadata(pool, 'tagihan_bulanan', { backfill_done: true });
    return totalSynced;
}

// --- Incremental ---
async function syncNewTagihanBulanan(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'tagihan_bulanan');
    const lastMaxId = metadata?.last_max_id ?? 0;

    const { data, error } = await supabase
        .from('tagihan_bulanan')
        .select('*')
        .gt('id', lastMaxId)
        .order('id', { ascending: true })
        .limit(config.syncBatchSize);

    if (error) {
        throw new Error(`Supabase incremental fetch error: ${error.message}`);
    }

    if (!data || data.length === 0) return 0;

    // Paginate if more than batch size
    let allData = [...data];
    let currentMaxId = data[data.length - 1].id;

    while (data.length === config.syncBatchSize) {
        const { data: moreData, error: moreError } = await supabase
            .from('tagihan_bulanan')
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
        await upsertBatch(pool, chunk as TagihanBulananRow[]);
    }

    await updateMetadata(pool, 'tagihan_bulanan', { last_max_id: currentMaxId });
    console.log(`[sync:tagihan_bulanan] Incremental: ${allData.length} new rows, last_id=${currentMaxId}`);
    return allData.length;
}

// --- Recent re-scan (by created_at — no updated_at in production) ---
async function syncRecentTagihanBulanan(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const cutoffISO = getWibTimestampCutoff(RECENT_WINDOW_DAYS);

    let allData: TagihanBulananRow[] = [];
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('tagihan_bulanan')
            .select('*')
            .gte('created_at', cutoffISO)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Supabase recent fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        allData = allData.concat(data as TagihanBulananRow[]);
        page++;

        if (data.length < pageSize) break;
    }

    if (allData.length === 0) return 0;

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        await upsertBatch(pool, chunk as TagihanBulananRow[]);
    }

    console.log(`[sync:tagihan_bulanan] Recent re-scan: ${allData.length} rows upserted`);
    return allData.length;
}

// --- Delete detection ---
async function detectDeletedTagihanBulanan(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const cutoffDate = getWibCutoff(RECENT_WINDOW_DAYS);

    // Get local active IDs within re-scan window (using due_date as the temporal anchor)
    const localResult = await pool.query<{ id: number }>(
        `SELECT id FROM tagihan_bulanan WHERE due_date >= $1 AND is_deleted = FALSE`,
        [cutoffDate]
    );
    const localIds = new Set<number>(localResult.rows.map((r) => r.id));

    if (localIds.size === 0) return 0;

    // Get production IDs in the same date range (paginate)
    const productionIds = new Set<number>();
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('tagihan_bulanan')
            .select('id')
            .gte('due_date', cutoffDate)
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

    // Find deleted: local IDs not in production
    const deletedIds: number[] = [];
    for (const id of localIds) {
        if (!productionIds.has(id)) {
            deletedIds.push(id);
        }
    }

    if (deletedIds.length === 0) return 0;

    // Mark as deleted
    const placeholders = deletedIds.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
        `UPDATE tagihan_bulanan SET is_deleted = TRUE, synced_at = NOW() WHERE id IN (${placeholders})`,
        deletedIds
    );

    console.log(`[sync:tagihan_bulanan] Marked ${deletedIds.length} tagihan_bulanan as deleted`);
    return deletedIds.length;
}

// --- Main sync function ---
export async function syncTagihanBulanan(
    pool: Pool,
    supabase: SupabaseClient
): Promise<{ rowsSynced: number; rowsDeleted: number; durationMs: number }> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'tagihan_bulanan', 'full');

    try {
        const metadata = await getMetadata(pool, 'tagihan_bulanan');
        let rowsSynced = 0;
        let rowsDeleted = 0;

        if (!metadata || !metadata.backfill_done) {
            // Initial backfill
            rowsSynced = await backfillTagihanBulanan(pool, supabase);
        } else {
            // Incremental + re-scan + delete detection
            const newCount = await syncNewTagihanBulanan(pool, supabase);
            const recentCount = await syncRecentTagihanBulanan(pool, supabase);
            rowsSynced = newCount + recentCount;
            rowsDeleted = await detectDeletedTagihanBulanan(pool, supabase);
        }

        // Update row count metadata
        const countResult = await pool.query('SELECT COUNT(*) as cnt FROM tagihan_bulanan');
        const rowCount = parseInt(countResult.rows[0]?.cnt || '0', 10);

        await updateMetadata(pool, 'tagihan_bulanan', {
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

        await updateMetadata(pool, 'tagihan_bulanan', {
            sync_status: 'error',
            error_message: errorMsg,
        }).catch(() => { });

        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });

        throw err;
    }
}
