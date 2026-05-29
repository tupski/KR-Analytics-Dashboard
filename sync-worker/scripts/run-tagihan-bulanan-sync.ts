/**
 * run-tagihan-bulanan-sync.ts
 * Standalone runner for tagihan_bulanan sync with mode support.
 *
 * Usage:
 *   cd sync-worker && npx tsx scripts/run-tagihan-bulanan-sync.ts --mode=backfill
 *   npx tsx scripts/run-tagihan-bulanan-sync.ts --mode=incremental
 *   npx tsx scripts/run-tagihan-bulanan-sync.ts --mode=recent
 *   npx tsx scripts/run-tagihan-bulanan-sync.ts --mode=delete-detect
 *   npx tsx scripts/run-tagihan-bulanan-sync.ts --mode=full
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

dotenvConfig({ path: path.resolve(__dirname, '../.env') });

import { getPool, closePool } from '../src/db';
import { getSupabaseClient } from '../src/supabase';
import { syncTagihanBulanan } from '../src/sync/tagihan-bulanan';
import { getMetadata, updateMetadata } from '../src/sync/metadata';

async function main() {
    const args = process.argv.slice(2);
    const modeFlag = args.find((a) => a.startsWith('--mode='));
    const mode = modeFlag ? modeFlag.split('=')[1] : 'full';

    console.log(`[run:tagihan_bulanan] Mode: ${mode}`);

    const pool = getPool();
    const supabase = getSupabaseClient();

    try {
        // Ensure metadata row exists
        let meta = await getMetadata(pool, 'tagihan_bulanan');
        if (!meta) {
            await updateMetadata(pool, 'tagihan_bulanan', { last_max_id: 0, backfill_done: false });
            meta = await getMetadata(pool, 'tagihan_bulanan');
        }

        if (mode === 'backfill') {
            console.log('[run:tagihan_bulanan] Running backfill...');
            const rows = await backfillOnly(pool, supabase);
            console.log(`[run:tagihan_bulanan] Backfill complete: ${rows} rows`);
        } else if (mode === 'incremental') {
            console.log('[run:tagihan_bulanan] Running incremental sync...');
            const rows = await incrementalOnly(pool, supabase);
            console.log(`[run:tagihan_bulanan] Incremental complete: ${rows} rows`);
        } else if (mode === 'recent') {
            console.log('[run:tagihan_bulanan] Running recent re-scan...');
            const rows = await recentOnly(pool, supabase);
            console.log(`[run:tagihan_bulanan] Recent re-scan complete: ${rows} rows`);
        } else if (mode === 'delete-detect') {
            console.log('[run:tagihan_bulanan] Running delete detection...');
            const rows = await deleteDetectOnly(pool, supabase);
            console.log(`[run:tagihan_bulanan] Delete detection complete: ${rows} rows`);
        } else if (mode === 'full') {
            console.log('[run:tagihan_bulanan] Running full sync cycle...');
            const result = await syncTagihanBulanan(pool, supabase);
            console.log(`[run:tagihan_bulanan] Done: ${result.rowsSynced} synced, ${result.rowsDeleted} deleted in ${result.durationMs}ms`);
        } else {
            console.error(`Unknown mode: ${mode}`);
            process.exit(1);
        }

        // Show final metadata
        const finalMeta = await getMetadata(pool, 'tagihan_bulanan');
        if (finalMeta) {
            console.log('\n[run:tagihan_bulanan] Final metadata:');
            console.log(JSON.stringify(finalMeta, null, 2));
        }
    } catch (err) {
        console.error('[run:tagihan_bulanan] Failed:', err);
        process.exit(1);
    } finally {
        await closePool();
    }
}

// --- Direct imports of internal functions (duplicated logic for standalone mode) ---

import { config } from '../src/config';

async function backfillOnly(pool: any, supabase: any): Promise<number> {
    const meta = await getMetadata(pool, 'tagihan_bulanan');
    if (meta?.backfill_done) {
        console.log('[backfill] Already done, skipping');
        return 0;
    }

    let lastSeenId = meta?.last_max_id ?? 0;
    let totalSynced = 0;
    const batchSize = config.syncBatchSize;

    while (true) {
        const { data, error } = await supabase
            .from('tagihan_bulanan')
            .select('*')
            .gt('id', lastSeenId)
            .order('id', { ascending: true })
            .limit(batchSize);

        if (error) throw new Error(`Supabase fetch error: ${error.message}`);
        if (!data || data.length === 0) break;

        for (let i = 0; i < data.length; i += 500) {
            const chunk = data.slice(i, i + 500);
            const values = chunk.flatMap((r: any) => [
                r.id, r.apartment_location, r.room_number, r.amount, r.due_date,
                r.status, r.paid_at, r.proof_url, r.user_id, r.created_at,
                r.is_recurring, r.recurring_parent_id,
            ]);
            const colList = ['id', 'apartment_location', 'room_number', 'amount', 'due_date',
                'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
                'is_recurring', 'recurring_parent_id', 'synced_at', 'is_deleted'].join(', ');
            const ph = chunk.map((_: any, idx: number) => {
                const off = idx * 12;
                return `(${Array.from({ length: 12 }, (_, i) => `$${off + i + 1}`).join(', ')}, NOW(), FALSE)`;
            }).join(',\n');
            const updateClauses = ['id', 'apartment_location', 'room_number', 'amount', 'due_date',
                'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
                'is_recurring', 'recurring_parent_id'].map((c) => `${c} = EXCLUDED.${c}`).join(', ');

            await pool.query(`
                INSERT INTO tagihan_bulanan (${colList})
                VALUES ${ph}
                ON CONFLICT (id) DO UPDATE SET ${updateClauses}, synced_at = NOW(), is_deleted = FALSE
            `, values);
        }

        lastSeenId = data[data.length - 1].id;
        totalSynced += data.length;
        await updateMetadata(pool, 'tagihan_bulanan', { last_max_id: lastSeenId });
        console.log(`[backfill] Progress: ${totalSynced} rows, last_id=${lastSeenId}`);
        if (data.length < batchSize) break;
    }

    await updateMetadata(pool, 'tagihan_bulanan', { backfill_done: true });
    return totalSynced;
}

async function incrementalOnly(pool: any, supabase: any): Promise<number> {
    const meta = await getMetadata(pool, 'tagihan_bulanan');
    const lastMaxId = meta?.last_max_id ?? 0;

    const { data, error } = await supabase
        .from('tagihan_bulanan')
        .select('*')
        .gt('id', lastMaxId)
        .order('id', { ascending: true })
        .limit(config.syncBatchSize);

    if (error) throw new Error(`Incremental fetch error: ${error.message}`);
    if (!data || data.length === 0) return 0;

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
        const values = chunk.flatMap((r: any) => [
            r.id, r.apartment_location, r.room_number, r.amount, r.due_date,
            r.status, r.paid_at, r.proof_url, r.user_id, r.created_at,
            r.is_recurring, r.recurring_parent_id,
        ]);
        const colList = ['id', 'apartment_location', 'room_number', 'amount', 'due_date',
            'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
            'is_recurring', 'recurring_parent_id', 'synced_at', 'is_deleted'].join(', ');
        const ph = chunk.map((_: any, idx: number) => {
            const off = idx * 12;
            return `(${Array.from({ length: 12 }, (_, i) => `$${off + i + 1}`).join(', ')}, NOW(), FALSE)`;
        }).join(',\n');
        const updateClauses = ['id', 'apartment_location', 'room_number', 'amount', 'due_date',
            'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
            'is_recurring', 'recurring_parent_id'].map((c) => `${c} = EXCLUDED.${c}`).join(', ');

        await pool.query(`
            INSERT INTO tagihan_bulanan (${colList})
            VALUES ${ph}
            ON CONFLICT (id) DO UPDATE SET ${updateClauses}, synced_at = NOW(), is_deleted = FALSE
        `, values);
    }

    await updateMetadata(pool, 'tagihan_bulanan', { last_max_id: currentMaxId });
    return allData.length;
}

function getWibTimestampCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(wibMs);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
}

function getWibDateCutoff(daysAgo: number): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(wibMs);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

async function recentOnly(pool: any, supabase: any): Promise<number> {
    const cutoffISO = getWibTimestampCutoff(14);

    let allData: any[] = [];
    let page = 0;
    const pageSize = config.syncBatchSize;

    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('tagihan_bulanan')
            .select('*')
            .gte('created_at', cutoffISO)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) throw new Error(`Recent fetch error: ${error.message}`);
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        page++;
        if (data.length < pageSize) break;
    }

    if (allData.length === 0) return 0;

    for (let i = 0; i < allData.length; i += 500) {
        const chunk = allData.slice(i, i + 500);
        const values = chunk.flatMap((r: any) => [
            r.id, r.apartment_location, r.room_number, r.amount, r.due_date,
            r.status, r.paid_at, r.proof_url, r.user_id, r.created_at,
            r.is_recurring, r.recurring_parent_id,
        ]);
        const colList = ['id', 'apartment_location', 'room_number', 'amount', 'due_date',
            'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
            'is_recurring', 'recurring_parent_id', 'synced_at', 'is_deleted'].join(', ');
        const ph = chunk.map((_: any, idx: number) => {
            const off = idx * 12;
            return `(${Array.from({ length: 12 }, (_, i) => `$${off + i + 1}`).join(', ')}, NOW(), FALSE)`;
        }).join(',\n');
        const updateClauses = ['id', 'apartment_location', 'room_number', 'amount', 'due_date',
            'status', 'paid_at', 'proof_url', 'user_id', 'created_at',
            'is_recurring', 'recurring_parent_id'].map((c) => `${c} = EXCLUDED.${c}`).join(', ');

        await pool.query(`
            INSERT INTO tagihan_bulanan (${colList})
            VALUES ${ph}
            ON CONFLICT (id) DO UPDATE SET ${updateClauses}, synced_at = NOW(), is_deleted = FALSE
        `, values);
    }

    return allData.length;
}

async function deleteDetectOnly(pool: any, supabase: any): Promise<number> {
    const cutoffDate = getWibDateCutoff(14);

    const localResult = await pool.query(
        `SELECT id FROM tagihan_bulanan WHERE due_date >= $1 AND is_deleted = FALSE`,
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
            .from('tagihan_bulanan')
            .select('id')
            .gte('due_date', cutoffDate)
            .order('id', { ascending: true })
            .range(from, to);

        if (error) throw new Error(`Delete-detect fetch error: ${error.message}`);
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
        `UPDATE tagihan_bulanan SET is_deleted = TRUE, synced_at = NOW() WHERE id IN (${placeholders})`,
        deletedIds
    );

    return deletedIds.length;
}

main();
