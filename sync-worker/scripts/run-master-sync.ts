/**
 * run-master-sync.ts
 * Standalone runner for master tables sync (5 reference tables).
 * Usage: cd sync-worker && npx tsx scripts/run-master-sync.ts
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

dotenvConfig({ path: path.resolve(__dirname, '../.env') });

import { getPool, closePool } from '../src/db';
import { getSupabaseClient } from '../src/supabase';
import { syncMasterTables } from '../src/sync/master';

async function main() {
    console.log('[run] Starting master tables sync...');
    console.log('[run] SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
    console.log('[run] LOCAL_DB_HOST:', process.env.LOCAL_DB_HOST || 'MISSING');

    const pool = getPool();
    const supabase = getSupabaseClient();

    try {
        const result = await syncMasterTables(pool, supabase);
        console.log(`[run] Status: ${result.status}`);
        for (const t of result.tables) {
            console.log(`[run]   ${t.tableName}: ${t.rowsSynced} upserted, ${t.rowsDeleted} deleted in ${t.durationMs}ms`);
        }
    } catch (err) {
        console.error('[run] Failed:', err);
    } finally {
        await closePool();
    }
}

main();
