require('dotenv').config();

import http from 'http';
import { config } from './config';
import { getPool, closePool } from './db';
import { getSupabaseClient } from './supabase';
import { syncTransactions } from './sync/transactions';
import { syncPengeluaran } from './sync/pengeluaran';
import { syncTagihanBulanan } from './sync/tagihan-bulanan';
import { syncTagihanFeeLunasCombined } from './sync/tagihan-fee-lunas';
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

        const totalDuration = Date.now() - (Date.now() - (txResult.durationMs + pResult.durationMs + tbResult.durationMs + flResult.parent.durationMs + flResult.items.durationMs));
        console.log(`[sync] Cycle complete: total ${txResult.rowsSynced + pResult.rowsSynced + tbResult.rowsSynced + flResult.parent.rowsSynced + flResult.items.rowsSynced} synced, ${txResult.rowsDeleted + pResult.rowsDeleted + tbResult.rowsDeleted + flResult.parent.rowsDeleted + flResult.items.rowsDeleted} deleted`);
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
