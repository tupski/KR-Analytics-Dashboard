/**
 * run-summary-refresh.ts
 * Standalone runner for summary table refresh.
 *
 * Usage:
 *   npx tsx scripts/run-summary-refresh.ts --mode=window       # 90 day window
 *   npx tsx scripts/run-summary-refresh.ts --mode=full         # full rebuild
 *   npx tsx scripts/run-summary-refresh.ts --table=revenue --mode=window
 *   npx tsx scripts/run-summary-refresh.ts --table=monthly --mode=full
 *   npx tsx scripts/run-summary-refresh.ts --table=expense --mode=window
 *   npx tsx scripts/run-summary-refresh.ts --table=occupancy --mode=full
 *
 * Table names: revenue, monthly, expense, occupancy, all
 */

import 'dotenv/config';
import { Pool } from 'pg';
import {
    refreshAllSummaries,
    refreshDailyRevenue,
    refreshMonthlySummary,
    refreshExpenseSummary,
    refreshOccupancyDaily,
    RefreshOptions,
} from '../src/sync/summary';

// ─── Parse args ──────────────────────────────────────────────────────

function parseArgs(): { mode: 'window' | 'full'; table: string; windowDays: number } {
    const args = process.argv.slice(2);
    const getVal = (prefix: string): string | undefined => {
        const arg = args.find(a => a.startsWith(`${prefix}=`));
        return arg ? arg.split('=')[1] : undefined;
    };

    const mode = (getVal('--mode') || 'window') as 'window' | 'full';
    const table = getVal('--table') || 'all';
    const windowDays = parseInt(getVal('--window-days') || '90', 10);

    if (mode !== 'window' && mode !== 'full') {
        console.error(`Invalid mode: ${mode}. Use 'window' or 'full'`);
        process.exit(1);
    }

    return { mode, table, windowDays };
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
    const { mode, table, windowDays } = parseArgs();

    console.log('='.repeat(70));
    console.log('SUMMARY REFRESH RUNNER');
    console.log('='.repeat(70));
    console.log(`  Mode:       ${mode}`);
    console.log(`  Table:      ${table}`);
    console.log(`  Window days: ${windowDays}`);
    console.log('');

    const pool = new Pool({
        host: process.env.LOCAL_DB_HOST || 'localhost',
        port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
        database: process.env.LOCAL_DB_NAME || 'kr_analytics',
        user: process.env.LOCAL_DB_USER || 'analytics',
        password: process.env.LOCAL_DB_PASSWORD || 'analytics_dev_password',
    });

    const opts: RefreshOptions = { mode, windowDays };

    try {
        // Test connection
        await pool.query('SELECT 1');
        console.log('[runner] Local DB connected\n');

        let result;

        switch (table) {
            case 'revenue':
                result = await refreshDailyRevenue(pool, opts);
                console.log(`\n✓ ${result.tableName}: ${result.rowsInserted} rows in ${result.durationMs}ms`);
                break;
            case 'monthly':
                result = await refreshMonthlySummary(pool, opts);
                console.log(`\n✓ ${result.tableName}: ${result.rowsInserted} rows in ${result.durationMs}ms`);
                break;
            case 'expense':
                result = await refreshExpenseSummary(pool, opts);
                console.log(`\n✓ ${result.tableName}: ${result.rowsInserted} rows in ${result.durationMs}ms`);
                break;
            case 'occupancy':
                result = await refreshOccupancyDaily(pool, opts);
                console.log(`\n✓ ${result.tableName}: ${result.rowsInserted} rows in ${result.durationMs}ms`);
                break;
            case 'all':
            default:
                result = await refreshAllSummaries(pool, opts);
                console.log(`\nStatus: ${result.status}`);
                for (const r of result.summaries) {
                    const status = r.durationMs === 0 ? '❌ FAILED' : '✓ ok';
                    console.log(`  ${status} ${r.tableName}: ${r.rowsInserted} rows (${r.durationMs}ms)`);
                }
                break;
        }

        console.log('\n[runner] Done.');
    } catch (err) {
        console.error('\n❌ Runner failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
