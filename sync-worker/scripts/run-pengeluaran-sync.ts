/**
 * run-pengeluaran-sync.ts
 * Standalone runner to test pengeluaran sync only.
 * Usage: cd sync-worker && npx tsx scripts/run-pengeluaran-sync.ts
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Explicitly load .env from sync-worker root
dotenvConfig({ path: path.resolve(__dirname, '../.env') });

import { getPool, closePool } from '../src/db';
import { getSupabaseClient } from '../src/supabase';
import { syncPengeluaran } from '../src/sync/pengeluaran';

async function main() {
    console.log('[run] Starting pengeluaran sync...');
    console.log('[run] SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
    console.log('[run] LOCAL_DB_HOST:', process.env.LOCAL_DB_HOST || 'MISSING');

    const pool = getPool();
    const supabase = getSupabaseClient();

    try {
        const result = await syncPengeluaran(pool, supabase);
        console.log(`[run] Done: ${result.rowsSynced} synced, ${result.rowsDeleted} deleted in ${result.durationMs}ms`);
    } catch (err) {
        console.error('[run] Failed:', err);
    } finally {
        await closePool();
    }
}

main();
