require('dotenv').config();

import http from 'http';
import { config } from './config';
import { getPool, closePool } from './db';
import { getSupabaseClient } from './supabase';
import { syncTransactions } from './sync/transactions';
import { syncPengeluaran } from './sync/pengeluaran';
import { syncTagihanBulanan } from './sync/tagihan-bulanan';
import { syncTagihanFeeLunasCombined } from './sync/tagihan-fee-lunas';
import { syncMasterTables } from './sync/master';
import { refreshAllSummaries } from './sync/summary';
import { getMetadata } from './sync/metadata';

let lastSyncResult: { rowsSynced: number; rowsDeleted: number; durationMs: number } | null = null;
let isSyncing = false;

async function runSyncCycle() {
    if (isSyncing) {
        console.log('[sync] Skipping — previous sync still running');
        return;
    }
    isSyncing = true;
    const pool = getPool();
    const supabase = getSupabaseClient();

    try {
        console.log('[sync] Starting sync cycle...');

        // Sync transactions
        const txResult = await syncTransactions(pool, supabase);
        lastSyncResult = txResult;
        console.log(`[sync] transactions: ${txResult.rowsSynced} synced, ${txResult.rowsDeleted} deleted in ${txResult.durationMs}ms`);

        // Sync pengeluaran
        const pResult = await syncPengeluaran(pool, supabase);
        console.log(`[sync] pengeluaran: ${pResult.rowsSynced} synced, ${pResult.rowsDeleted} deleted in ${pResult.durationMs}ms`);

        // Sync tagihan_bulanan
        const tbResult = await syncTagihanBulanan(pool, supabase);
        console.log(`[sync] tagihan_bulanan: ${tbResult.rowsSynced} synced, ${tbResult.rowsDeleted} deleted in ${tbResult.durationMs}ms`);

        // Sync tagihan_fee_lunas (parent) + tagihan_fee_lunas_items (items)
        const flResult = await syncTagihanFeeLunasCombined(pool, supabase);
        console.log(`[sync] tagihan_fee_lunas: ${flResult.parent.rowsSynced} synced, ${flResult.parent.rowsDeleted} deleted in ${flResult.parent.durationMs}ms`);
        console.log(`[sync] tagihan_fee_lunas_items: ${flResult.items.rowsSynced} synced, ${flResult.items.rowsDeleted} deleted in ${flResult.items.durationMs}ms`);

        // Sync master tables (full re-scan — all 5)
        const masterResult = await syncMasterTables(pool, supabase);
        console.log(`[sync] master tables: ${masterResult.tables.map(t => `${t.tableName}=${t.rowsSynced}`).join(', ')}`);

        // Refresh analytics summary tables (from local mirrors only)
        const summaryResult = await refreshAllSummaries(pool, { mode: 'window' });
        console.log(`[sync] summary tables: ${summaryResult.summaries.map(s => `${s.tableName}=${s.rowsInserted}`).join(', ')}`);

        const totalSynced = txResult.rowsSynced + pResult.rowsSynced + tbResult.rowsSynced + flResult.parent.rowsSynced + flResult.items.rowsSynced;
        const totalDeleted = txResult.rowsDeleted + pResult.rowsDeleted + tbResult.rowsDeleted + flResult.parent.rowsDeleted + flResult.items.rowsDeleted;
        console.log(`[sync] Cycle complete: total ${totalSynced} synced, ${totalDeleted} deleted`);
    } catch (error) {
        console.error('[sync] Cycle failed:', error);
    } finally {
        isSyncing = false;
    }
}

// Health server
const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        try {
            const pool = getPool();
            const txMeta = await getMetadata(pool, 'transactions');
            const pMeta = await getMetadata(pool, 'pengeluaran');
            const tbMeta = await getMetadata(pool, 'tagihan_bulanan');
            const flMeta = await getMetadata(pool, 'tagihan_fee_lunas');
            const fliMeta = await getMetadata(pool, 'tagihan_fee_lunas_items');
            const nkMeta = await getMetadata(pool, 'nomor_kamar');
            const laMeta = await getMetadata(pool, 'lokasi_apartemen');
            const pcMeta = await getMetadata(pool, 'pengeluaran_categories');
            const klMeta = await getMetadata(pool, 'karyawan_list');
            const mlMeta = await getMetadata(pool, 'marketing_list');
            const drMeta = await getMetadata(pool, 'analytics_daily_revenue');
            const msMeta = await getMetadata(pool, 'analytics_monthly_summary');
            const odMeta = await getMetadata(pool, 'analytics_occupancy_daily');
            const esMeta = await getMetadata(pool, 'analytics_expense_summary');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                service: 'kr-analytics-sync-worker',
                timestamp: new Date().toISOString(),
                syncing: isSyncing,
                lastSync: lastSyncResult,
                transactions: txMeta ? {
                    lastSyncAt: txMeta.last_sync_at,
                    lastMaxId: txMeta.last_max_id,
                    rowCount: txMeta.row_count,
                    syncStatus: txMeta.sync_status,
                    backfillDone: txMeta.backfill_done,
                } : null,
                pengeluaran: pMeta ? {
                    lastSyncAt: pMeta.last_sync_at,
                    lastMaxId: pMeta.last_max_id,
                    rowCount: pMeta.row_count,
                    syncStatus: pMeta.sync_status,
                    backfillDone: pMeta.backfill_done,
                } : null,
                tagihan_bulanan: tbMeta ? {
                    lastSyncAt: tbMeta.last_sync_at,
                    lastMaxId: tbMeta.last_max_id,
                    rowCount: tbMeta.row_count,
                    syncStatus: tbMeta.sync_status,
                    backfillDone: tbMeta.backfill_done,
                } : null,
                tagihan_fee_lunas: flMeta ? {
                    lastSyncAt: flMeta.last_sync_at,
                    lastMaxId: flMeta.last_max_id,
                    rowCount: flMeta.row_count,
                    syncStatus: flMeta.sync_status,
                    backfillDone: flMeta.backfill_done,
                } : null,
                tagihan_fee_lunas_items: fliMeta ? {
                    lastSyncAt: fliMeta.last_sync_at,
                    lastMaxId: fliMeta.last_max_id,
                    rowCount: fliMeta.row_count,
                    syncStatus: fliMeta.sync_status,
                    backfillDone: fliMeta.backfill_done,
                } : null,
                nomor_kamar: nkMeta ? {
                    lastSyncAt: nkMeta.last_sync_at,
                    rowCount: nkMeta.row_count,
                    syncStatus: nkMeta.sync_status,
                } : null,
                lokasi_apartemen: laMeta ? {
                    lastSyncAt: laMeta.last_sync_at,
                    rowCount: laMeta.row_count,
                    syncStatus: laMeta.sync_status,
                } : null,
                pengeluaran_categories: pcMeta ? {
                    lastSyncAt: pcMeta.last_sync_at,
                    rowCount: pcMeta.row_count,
                    syncStatus: pcMeta.sync_status,
                } : null,
                karyawan_list: klMeta ? {
                    lastSyncAt: klMeta.last_sync_at,
                    rowCount: klMeta.row_count,
                    syncStatus: klMeta.sync_status,
                } : null,
                marketing_list: mlMeta ? {
                    lastSyncAt: mlMeta.last_sync_at,
                    rowCount: mlMeta.row_count,
                    syncStatus: mlMeta.sync_status,
                } : null,
                analytics_daily_revenue: drMeta ? {
                    lastSyncAt: drMeta.last_sync_at,
                    rowCount: drMeta.row_count,
                    syncStatus: drMeta.sync_status,
                    refreshRange: drMeta.summary_refresh_range_start,
                } : null,
                analytics_monthly_summary: msMeta ? {
                    lastSyncAt: msMeta.last_sync_at,
                    rowCount: msMeta.row_count,
                    syncStatus: msMeta.sync_status,
                    refreshRange: msMeta.summary_refresh_range_start,
                } : null,
                analytics_occupancy_daily: odMeta ? {
                    lastSyncAt: odMeta.last_sync_at,
                    rowCount: odMeta.row_count,
                    syncStatus: odMeta.sync_status,
                    refreshRange: odMeta.summary_refresh_range_start,
                } : null,
                analytics_expense_summary: esMeta ? {
                    lastSyncAt: esMeta.last_sync_at,
                    rowCount: esMeta.row_count,
                    syncStatus: esMeta.sync_status,
                    refreshRange: esMeta.summary_refresh_range_start,
                } : null,
            }));
        } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                service: 'kr-analytics-sync-worker',
                timestamp: new Date().toISOString(),
                syncing: isSyncing,
                lastSync: lastSyncResult,
                transactions: null,
                pengeluaran: null,
                tagihan_bulanan: null,
                tagihan_fee_lunas: null,
                tagihan_fee_lunas_items: null,
                nomor_kamar: null,
                lokasi_apartemen: null,
                pengeluaran_categories: null,
                karyawan_list: null,
                marketing_list: null,
            }));
        }
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

async function main() {
    console.log(`[sync-worker] Starting on port ${config.healthPort}`);
    console.log(`[sync-worker] Sync interval: ${config.syncIntervalMs}ms`);
    console.log(`[sync-worker] Batch size: ${config.syncBatchSize}`);
    console.log(`[sync-worker] Lookback days: ${config.syncLookbackDays}`);

    // Start health server
    server.listen(config.healthPort, () => {
        console.log(`[sync-worker] Health endpoint on :${config.healthPort}/health`);
    });

    // Run initial sync
    await runSyncCycle();

    // Schedule periodic sync
    setInterval(runSyncCycle, config.syncIntervalMs);
    console.log(`[sync-worker] Periodic sync scheduled every ${config.syncIntervalMs / 1000}s`);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[sync-worker] Shutting down...');
    server.close();
    await closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[sync-worker] Interrupted, shutting down...');
    server.close();
    await closePool();
    process.exit(0);
});

main().catch((err) => {
    console.error('[sync-worker] Fatal error:', err);
    process.exit(1);
});
