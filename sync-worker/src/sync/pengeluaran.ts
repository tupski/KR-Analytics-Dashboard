import { Pool } from 'pg';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { getMetadata, updateMetadata, isFullRescanDue } from './metadata';
import { startSyncLog, completeSyncLog } from './logger';

const UPSERT_COLUMNS = [
    'id', 'nama_pengeluaran', 'jumlah', 'tanggal', 'keterangan',
    'user_id', 'created_at', 'category', 'apartment_location', 'room_number',
] as const;

const COL_COUNT = UPSERT_COLUMNS.length; // 10

interface PengeluaranRow {
    id: number;
    nama_pengeluaran: string;
    jumlah: number;
    tanggal: string;
    keterangan: string | null;
    user_id: string | null;
    created_at: string | null;
    category: string | null;
    apartment_location: string | null;
    room_number: string | null;
}

function rowToValues(row: PengeluaranRow): unknown[] {
    return [
        row.id, row.nama_pengeluaran, row.jumlah, row.tanggal, row.keterangan,
        row.user_id, row.created_at, row.category, row.apartment_location, row.room_number,
    ];
}

function buildUpsertSQLBatch(rows: PengeluaranRow[]): string {
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
    INSERT INTO pengeluaran (${colList})
    VALUES ${valuePlaceholders.join(',\n')}
    ON CONFLICT (id) DO UPDATE SET
      ${updateClauses},
      synced_at = NOW(),
      is_deleted = FALSE
  `.trim();

    return sql;
}

async function upsertBatch(pool: Pool, rows: PengeluaranRow[]): Promise<void> {
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
    // Adjust to WIB (UTC+7) for correct date calculation
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const wibDate = new Date(wibMs);
    wibDate.setDate(wibDate.getDate() - daysAgo);
    return wibDate.toISOString().split('T')[0];
}

// --- 3b. Backfill ---
async function backfillPengeluaran(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'pengeluaran');
    if (metadata?.backfill_done) {
        console.log('[sync:pengeluaran] Backfill already done, skipping');
        return 0;
    }

    let lastSeenId = metadata?.last_max_id ?? 0;
    let totalSynced = 0;
    const batchSize = config.syncBatchSize;

    console.log(`[sync:pengeluaran] Starting backfill from id > ${lastSeenId}`);

    while (true) {
        const { data, error } = await supabase
            .from('pengeluaran')
            .select('*')
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) {
            throw new Error(`Supabase fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) {
            console.log(`[sync:pengeluaran] Backfill complete: ${totalSynced} rows synced`);
            break;
        }

        // Upsert in chunks of 500
        for (let i = 0; i < data.length; i += 500) {
            const chunk = data.slice(i, i + 500);
            await upsertBatch(pool, chunk as PengeluaranRow[]);
        }

        lastSeenId = data[data.length - 1].id;
        totalSynced += data.length;

        await updateMetadata(pool, 'pengeluaran', { last_max_id: lastSeenId });
        console.log(`[sync:pengeluaran] Backfill progress: ${totalSynced} rows, last_id=${lastSeenId}`);

        if (data.length < batchSize) break;
    }

    await updateMetadata(pool, 'pengeluaran', { backfill_done: true });
    return totalSynced;
}

// --- 3c. Incremental ---
async function syncNewPengeluaran(
    pool: Pool,
    supabase: SupabaseClient
): Promise<number> {
    const metadata = await getMetadata(pool, 'pengeluaran');
    const lastMaxId = metadata?.last_max_id ?? 0;

    const { data, error } = await supabase
        .from('pengeluaran')
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
            .from('pengeluaran')
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
        await upsertBatch(pool, chunk as PengeluaranRow[]);
    }

    await updateMetadata(pool, 'pengeluaran', { last_max_id: currentMaxId });
    console.log(`[sync:pengeluaran] Incremental: ${allData.length} new rows, last_id=${currentMaxId}`);
    return allData.length;
}

// --- 3d. Recent re-scan ---
async function syncRecentPengeluaran(
    pool: Pool,
    supabase: SupabaseClient,
    windowDays: number
): Promise<number> {
    const cutoffDate = getWibCutoff(windowDays);

    let allData: PengeluaranRow[] = [];
    let page = 0;
    const pageSize = config.syncBatchSize;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('pengeluaran')
            .select('*')
            .gte('tanggal', cutoffDate)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) {
            throw new Error(`Supabase recent fetch error: ${error.message}`);
        }

        if (!data || data.length === 0) break;
        allData = allData.concat(data as PengeluaranRow[]);
        page++;

        if (data.length < pageSize) break;
    }

    if (allData.length === 0) return 0;

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        await upsertBatch(pool, chunk as PengeluaranRow[]);
    }

    console.log(`[sync:pengeluaran] Recent re-scan: ${allData.length} rows upserted`);
    return allData.length;
}

// --- 3e. Delete detection ---
async function detectDeletedPengeluaran(
    pool: Pool,
    supabase: SupabaseClient,
    windowDays: number
): Promise<number> {
    const cutoffDate = getWibCutoff(windowDays);

    // Get local active IDs within re-scan window
    const localResult = await pool.query<{ id: number }>(
        `SELECT id FROM pengeluaran WHERE tanggal >= $1 AND is_deleted = FALSE`,
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
            .from('pengeluaran')
            .select('id')
            .gte('tanggal', cutoffDate)
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
        `UPDATE pengeluaran SET is_deleted = TRUE, synced_at = NOW() WHERE id IN (${placeholders})`,
        deletedIds
    );

    console.log(`[sync:pengeluaran] Marked ${deletedIds.length} pengeluaran as deleted`);
    return deletedIds.length;
}

// --- Main sync function ---
export async function syncPengeluaran(
    pool: Pool,
    supabase: SupabaseClient
): Promise<{ rowsSynced: number; rowsDeleted: number; durationMs: number }> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'pengeluaran', 'full');

    try {
        const metadata = await getMetadata(pool, 'pengeluaran');
        let rowsSynced = 0;
        let rowsDeleted = 0;

        if (!metadata || !metadata.backfill_done) {
            // Initial backfill
            rowsSynced = await backfillPengeluaran(pool, supabase);
        } else {
            // Incremental + re-scan + delete detection
            // Narrow window per cycle; daily backstop widens to full lookback
            // (no updated_at on production pengeluaran yet).
            // ponytail: switch to updated_at watermark once the column exists.
            const fullRescan = isFullRescanDue(metadata);
            const windowDays = fullRescan ? config.syncLookbackDays : config.syncRecentWindowDays;
            const newCount = await syncNewPengeluaran(pool, supabase);
            const recentCount = await syncRecentPengeluaran(pool, supabase, windowDays);
            rowsSynced = newCount + recentCount;
            rowsDeleted = await detectDeletedPengeluaran(pool, supabase, windowDays);

            if (fullRescan) {
                await updateMetadata(pool, 'pengeluaran', { last_full_rescan_at: new Date() });
            }
        }

        // Update row count metadata
        const countResult = await pool.query('SELECT COUNT(*) as cnt FROM pengeluaran');
        const rowCount = parseInt(countResult.rows[0]?.cnt || '0', 10);

        await updateMetadata(pool, 'pengeluaran', {
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

        await updateMetadata(pool, 'pengeluaran', {
            sync_status: 'error',
            error_message: errorMsg,
        }).catch(() => { });

        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });

        throw err;
    }
}
