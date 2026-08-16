import { Pool } from 'pg';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { getMetadata, updateMetadata, isFullRescanDue } from './metadata';
import { startSyncLog, completeSyncLog } from './logger';

const UPSERT_COLUMNS = [
    'id', 'customer_name', 'marketing_name', 'rental_duration', 'shift', 'input_by',
    'apartment_location', 'room_number', 'cash_amount', 'transfer_amount', 'transfer_to',
    'marketing_fee', 'ktp_image_url', 'transfer_proof_url', 'user_id', 'created_at',
    'checkout_at', 'deposit_cash', 'deposit_transfer', 'deposit_returned_at',
    'deposit_refund_proof_url', 'checkin_at',
] as const;

const COL_COUNT = UPSERT_COLUMNS.length; // 22

interface TransactionRow {
    id: number;
    customer_name: string | null;
    marketing_name: string | null;
    rental_duration: number | null;
    shift: string | null;
    input_by: string | null;
    apartment_location: string | null;
    room_number: string | null;
    cash_amount: number | null;
    transfer_amount: number | null;
    transfer_to: string | null;
    marketing_fee: number | null;
    ktp_image_url: string | null;
    transfer_proof_url: string | null;
    user_id: string | null;
    created_at: string | null;
    checkout_at: string | null;
    deposit_cash: number | null;
    deposit_transfer: number | null;
    deposit_returned_at: string | null;
    deposit_refund_proof_url: string | null;
    checkin_at: string | null;
}

function rowToValues(row: TransactionRow): unknown[] {
    return [
        row.id, row.customer_name, row.marketing_name, row.rental_duration,
        row.shift, row.input_by, row.apartment_location, row.room_number,
        row.cash_amount, row.transfer_amount, row.transfer_to, row.marketing_fee,
        row.ktp_image_url, row.transfer_proof_url, row.user_id, row.created_at,
        row.checkout_at, row.deposit_cash, row.deposit_transfer, row.deposit_returned_at,
        row.deposit_refund_proof_url, row.checkin_at,
    ];
}

function buildUpsertSQL(rowCount: number): string {
    const colList = [...UPSERT_COLUMNS, 'synced_at', 'is_deleted'].join(', ');
    const valuePlaceholders: string[] = [];

    for (let r = 0; r < rowCount; r++) {
        const offset = r * COL_COUNT;
        const placeholders = Array.from({ length: COL_COUNT }, (_, i) => `$${offset + i + 1}`);
        valuePlaceholders.push(`(${placeholders.join(', ')}, NOW(), FALSE)`);
    }

    const updateClauses = UPSERT_COLUMNS.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

    return `
    INSERT INTO transactions (${colList})
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT (id) DO UPDATE SET
      ${updateClauses},
      synced_at = NOW(),
      is_deleted = FALSE
  `.trim();
}

function buildUpsertSQLBatch(rows: TransactionRow[]): string {
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
    INSERT INTO transactions (${colList})
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT (id) DO UPDATE SET
      ${updateClauses},
      synced_at = NOW(),
      is_deleted = FALSE
  `.trim();

    return sql;
}

async function upsertBatch(pool: Pool, rows: TransactionRow[]): Promise<void> {
    if (rows.length === 0) return;
    const sql = buildUpsertSQLBatch(rows);
    const values = rows.flatMap(rowToValues);
    await pool.query(sql, values);
}

// --- 6a. Backfill ---
async function backfillTransactions(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'transactions');
    if (metadata?.backfill_done) {
        console.log('[sync:tx] Backfill already done, skipping');
        return 0;
    }

    let lastSeenId = metadata?.last_max_id ?? 0;
    let totalSynced = 0;
    const batchSize = config.syncBatchSize;

    console.log(`[sync:tx] Starting backfill from id > ${lastSeenId}`);

    while (true) {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) {
            throw new Error(`Supabase fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) {
            console.log(`[sync:tx] Backfill complete: ${totalSynced} rows synced`);
            break;
        }

        // Upsert in chunks of 500
        for (let i = 0; i < data.length; i += 500) {
            const chunk = data.slice(i, i + 500);
            await upsertBatch(pool, chunk as TransactionRow[]);
        }

        lastSeenId = data[data.length - 1].id;
        totalSynced += data.length;

        await updateMetadata(pool, 'transactions', { last_max_id: lastSeenId });
        console.log(`[sync:tx] Backfill progress: ${totalSynced} rows, last_id=${lastSeenId}`);

        if (data.length < batchSize) break;
    }

    await updateMetadata(pool, 'transactions', { backfill_done: true });
    return totalSynced;
}

// --- 6b. Incremental new rows ---
async function syncNewTransactions(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'transactions');
    const lastMaxId = metadata?.last_max_id ?? 0;

    const { data, error } = await supabase
        .from('transactions')
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
            .from('transactions')
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
        await upsertBatch(pool, chunk as TransactionRow[]);
    }

    await updateMetadata(pool, 'transactions', { last_max_id: currentMaxId });
    console.log(`[sync:tx] Incremental: ${allData.length} new rows, last_id=${currentMaxId}`);
    return allData.length;
}

// --- 6c. Recent updates re-scan ---
async function syncRecentTransactions(
    pool: Pool,
    supabase: SupabaseClient,
    windowDays: number
): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffISO = cutoff.toISOString();

    let allData: TransactionRow[] = [];
    let page = 0;
    const pageSize = config.syncBatchSize;

    // Paginate through all recent rows
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .gte('checkin_at', cutoffISO)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Supabase recent fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        allData = allData.concat(data as TransactionRow[]);
        page++;

        if (data.length < pageSize) break;
    }

    if (allData.length === 0) return 0;

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        await upsertBatch(pool, chunk as TransactionRow[]);
    }

    console.log(`[sync:tx] Recent re-scan: ${allData.length} rows upserted`);
    return allData.length;
}

// --- 6d. Soft delete detection ---
async function detectDeletedTransactions(
    pool: Pool,
    supabase: SupabaseClient,
    windowDays: number
): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffISO = cutoff.toISOString();

    // Get local active IDs
    const localResult = await pool.query<{ id: number }>(
        `SELECT id FROM transactions WHERE checkin_at >= $1 AND is_deleted = FALSE`,
        [cutoffISO]
    );
    const localIds = new Set<number>(localResult.rows.map((r) => r.id));

    if (localIds.size === 0) return 0;

    // Get production IDs in the same range (paginate)
    const productionIds = new Set<number>();
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('transactions')
            .select('id')
            .gte('checkin_at', cutoffISO)
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
        `UPDATE transactions SET is_deleted = TRUE, synced_at = NOW() WHERE id IN (${placeholders})`,
        deletedIds
    );

    console.log(`[sync:tx] Marked ${deletedIds.length} transactions as deleted`);
    return deletedIds.length;
}

// --- Main sync function ---
export async function syncTransactions(
    pool: Pool,
    supabase: SupabaseClient
): Promise<{ rowsSynced: number; rowsDeleted: number; durationMs: number }> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'transactions', 'full');

    try {
        const metadata = await getMetadata(pool, 'transactions');
        let rowsSynced = 0;
        let rowsDeleted = 0;

        if (!metadata || !metadata.backfill_done) {
            // Initial backfill
            rowsSynced = await backfillTransactions(pool, supabase);
        } else {
            // Incremental sync
            // Narrow window per cycle; widens to full lookback on the daily
            // backstop. No updated_at column on production transactions yet,
            // so edits/deletes to older rows are caught by the full re-scan.
            // ponytail: switch to updated_at watermark once the column exists.
            const fullRescan = isFullRescanDue(metadata);
            const windowDays = fullRescan ? config.syncLookbackDays : config.syncRecentWindowDays;
            const newCount = await syncNewTransactions(pool, supabase);
            const recentCount = await syncRecentTransactions(pool, supabase, windowDays);
            rowsSynced = newCount + recentCount;
            rowsDeleted = await detectDeletedTransactions(pool, supabase, windowDays);

            // Persist backstop timestamp AFTER the widened cycle completes so
            // a crash mid-scan retries it on the next cycle.
            if (fullRescan) {
                await updateMetadata(pool, 'transactions', { last_full_rescan_at: new Date() });
            }
        }

        // Update metadata
        const countResult = await pool.query('SELECT COUNT(*) as cnt FROM transactions');
        const rowCount = parseInt(countResult.rows[0]?.cnt || '0', 10);

        await updateMetadata(pool, 'transactions', {
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

        await updateMetadata(pool, 'transactions', {
            sync_status: 'error',
            error_message: errorMsg,
        }).catch(() => { });

        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });

        throw err;
    }
}
