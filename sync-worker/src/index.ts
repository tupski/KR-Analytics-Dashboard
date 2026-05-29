require('dotenv').config();

import http from 'http';
import { config } from './config';
import { getPool, closePool } from './db';
import { getSupabaseClient } from './supabase';
import { syncTransactions } from './sync/transactions';
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
        const result = await syncTransactions(pool, supabase);
        lastSyncResult = result;
        console.log(`[sync] Cycle complete: ${result.rowsSynced} synced, ${result.rowsDeleted} deleted in ${result.durationMs}ms`);
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
            const metadata = await getMetadata(pool, 'transactions');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                service: 'kr-analytics-sync-worker',
                timestamp: new Date().toISOString(),
                syncing: isSyncing,
                lastSync: lastSyncResult,
                transactions: metadata ? {
                    lastSyncAt: metadata.last_sync_at,
                    lastMaxId: metadata.last_max_id,
                    rowCount: metadata.row_count,
                    syncStatus: metadata.sync_status,
                    backfillDone: metadata.backfill_done,
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
