require('dotenv').config();

import http from 'http';
import { config } from './config';
import { getPool, closePool } from './db';
import { getSupabaseClient } from './supabase';
import { syncTransactions } from './sync/transactions';
import { syncPengeluaran } from './sync/pengeluaran';
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

        const totalDuration = Date.now() - (Date.now() - (txResult.durationMs + pResult.durationMs));
        console.log(`[sync] Cycle complete: total ${txResult.rowsSynced + pResult.rowsSynced} synced, ${txResult.rowsDeleted + pResult.rowsDeleted} deleted`);
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
