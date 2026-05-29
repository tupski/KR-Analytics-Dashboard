/**
 * Quick script to dump sync_metadata and sync_logs for pengeluaran.
 * Usage: cd sync-worker && npx tsx -r dotenv/config scripts/dump-pengeluaran-meta.ts
 */
import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.LOCAL_DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || '5433', 10),
    database: process.env.LOCAL_DB_NAME || 'kr_analytics',
    user: process.env.LOCAL_DB_USER || 'analytics',
    password: process.env.LOCAL_DB_PASSWORD || 'analytics_dev_password',
});

async function main() {
    const meta = await pool.query("SELECT * FROM sync_metadata WHERE table_name = 'pengeluaran'");
    console.log('=== sync_metadata ===');
    console.log(JSON.stringify(meta.rows[0], null, 2));

    const logs = await pool.query("SELECT * FROM sync_logs WHERE table_name = 'pengeluaran' ORDER BY id DESC LIMIT 5");
    console.log('\n=== sync_logs (last 5) ===');
    console.log(JSON.stringify(logs.rows, null, 2));

    await pool.end();
}

main().catch(console.error);
