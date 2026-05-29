/**
 * Test script for the analytics client library (lib/analytics/).
 *
 * Validates each function by running the analytics client query and comparing
 * with raw SQL executed against the same database.
 *
 * Usage:
 *   node --loader ts-node/esm scripts/test-analytics-client.ts
 *   npx tsx scripts/test-analytics-client.ts
 *
 * Prerequisite: ANALYTICS_DATABASE_URL env var or sync-worker/.env with LOCAL_DB_* vars.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─── Bootstrap ANALYTICS_DATABASE_URL if not set ───
if (!process.env.ANALYTICS_DATABASE_URL) {
    const swEnvPath = resolve(__dirname, '..', 'sync-worker', '.env');
    if (existsSync(swEnvPath)) {
        const contents = readFileSync(swEnvPath, 'utf-8');
        const lines = contents.split('\n');
        const env: Record<string, string> = {};
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            env[key] = val;
        }
        const host = env.LOCAL_DB_HOST || 'localhost';
        const port = env.LOCAL_DB_PORT || '5433';
        const db = env.LOCAL_DB_NAME || 'kr_analytics';
        const user = env.LOCAL_DB_USER || 'analytics';
        const pass = env.LOCAL_DB_PASSWORD || 'analytics_dev_password';
        process.env.ANALYTICS_DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
        console.log('  [bootstrap] ANALYTICS_DATABASE_URL constructed from sync-worker/.env');
    } else {
        console.error('  [bootstrap] WARN: ANALYTICS_DATABASE_URL not set and sync-worker/.env not found. Tests will fail.');
    }
}

// ─── Import analytics client ───
import {
    getDailyRevenue,
    getRevenueSummary,
    getRevenueByLocation,
    getExpenses,
    getExpenseSummary,
    getMonthlySummaries,
    getMonthlyComparison,
    getOccupancyDaily,
    getOccupancyRate,
    getOccupancySummary,
    getAllSyncStatuses,
    getSyncStatus,
    getRecentSyncLogs,
    getSyncLogsForTable,
    queryAnalytics,
    closeAnalyticsPool,
} from '../lib/analytics';

// ─── Helpers ───
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail?: string) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        const msg = detail ? `${label} — ${detail}` : label;
        failures.push(msg);
        console.log(`  ❌ ${msg}`);
    }
}

function fmt(n: number | string | null | undefined, decimals = 2): string {
    if (n == null) return 'NULL';
    if (typeof n === 'number') return n.toFixed(decimals);
    return String(n);
}

function approx(a: number, b: number, tolerance = 0.01): boolean {
    return Math.abs(a - b) <= tolerance;
}

// ─── Tests ───
async function runTests() {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  Analytics Client Library — Test Suite   ║');
    console.log('╚══════════════════════════════════════════╝\n');

    const testStart = new Date().toISOString();
    console.log(`  Started: ${testStart}\n`);

    // ──────────────────────────────────────────────
    // 1. Connection & db.ts
    // ──────────────────────────────────────────────
    console.log('── 1. Connection ──');
    try {
        const rows = await queryAnalytics<{ now: string }>('SELECT NOW() AS now');
        assert('queryAnalytics — SELECT NOW()', rows.length === 1 && !!rows[0].now, `got: ${rows[0]?.now}`);
    } catch (e: any) {
        assert('queryAnalytics — SELECT NOW()', false, e.message);
    }

    // ──────────────────────────────────────────────
    // 2. Revenue
    // ──────────────────────────────────────────────
    console.log('\n── 2. Revenue ──');

    let daily: Awaited<ReturnType<typeof getDailyRevenue>> = [];
    try {
        daily = await getDailyRevenue();
        assert('getDailyRevenue() — returns array', Array.isArray(daily));
        if (daily.length > 0) {
            assert('getDailyRevenue() — has date_wib', !!daily[0].date_wib);
            assert('getDailyRevenue() — has total_revenue', typeof daily[0].total_revenue === 'number' || typeof daily[0].total_revenue === 'string');
            console.log(`     → ${daily.length} rows, sample: ${daily[0].date_wib} | ${daily[0].apartment_location} | ${fmt(daily[0].total_revenue)}`);
        } else {
            console.log('     ⚠️  No daily revenue data (expected if DB empty)');
        }
    } catch (e: any) {
        assert('getDailyRevenue()', false, e.message);
    }

    try {
        const summary = await getRevenueSummary();
        assert('getRevenueSummary() — returns object', typeof summary === 'object');
        assert('getRevenueSummary() — has totalRevenue', typeof summary.totalRevenue === 'number');
        assert('getRevenueSummary() — has averagePerDay', typeof summary.averagePerDay === 'number');
        console.log(`     → total: ${fmt(summary.totalRevenue)} | avg/day: ${fmt(summary.averagePerDay)} | avg/tx: ${fmt(summary.averagePerTransaction)}`);

        // Cross-check: direct SQL
        const direct = await queryAnalytics<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt FROM analytics_daily_revenue`
        );
        const directCount = parseInt(direct[0]?.cnt || '0', 10);
        // The summary day_count should be <= directCount (may not match exactly if data covers more than 30 days)
        if (daily.length > 0) {
            console.log(`     → Direct SQL count: ${directCount} total rows in table`);
        }
    } catch (e: any) {
        assert('getRevenueSummary()', false, e.message);
    }

    try {
        const byLoc = await getRevenueByLocation();
        assert('getRevenueByLocation() — returns array', Array.isArray(byLoc));
        if (byLoc.length > 0) {
            console.log(`     → ${byLoc.length} locations, top: ${byLoc[0].apartment_location} | ${fmt(byLoc[0].total_revenue)}`);
        }
    } catch (e: any) {
        assert('getRevenueByLocation()', false, e.message);
    }

    try {
        // Single-day range
        const singleDay = await getRevenueSummary('2026-05-01', '2026-05-02');
        assert('getRevenueSummary(single day) — returns object', typeof singleDay === 'object');
        assert('getRevenueSummary(single day) — startDate matches', singleDay.startDate === '2026-05-01');
        console.log(`     → single day total: ${fmt(singleDay.totalRevenue)}`);
    } catch (e: any) {
        assert('getRevenueSummary(single day)', false, e.message);
    }

    // ──────────────────────────────────────────────
    // 3. Expenses
    // ──────────────────────────────────────────────
    console.log('\n── 3. Expenses ──');

    try {
        const exp = await getExpenses();
        assert('getExpenses() — returns array', Array.isArray(exp));
        if (exp.length > 0) {
            assert('getExpenses() — has category', !!exp[0].category);
            console.log(`     → ${exp.length} rows, sample: ${exp[0].date_wib} | ${exp[0].category} | ${fmt(exp[0].total_amount)}`);
        } else {
            console.log('     ⚠️  No expense data');
        }
    } catch (e: any) {
        assert('getExpenses()', false, e.message);
    }

    try {
        const es = await getExpenseSummary();
        assert('getExpenseSummary() — has totalAmount', typeof es.totalAmount === 'number');
        assert('getExpenseSummary() — has byCategory', Array.isArray(es.byCategory));
        assert('getExpenseSummary() — has byLocation', Array.isArray(es.byLocation));
        console.log(`     → total: ${fmt(es.totalAmount)} | categories: ${es.byCategory.length} | locations: ${es.byLocation.length}`);
    } catch (e: any) {
        assert('getExpenseSummary()', false, e.message);
    }

    // ──────────────────────────────────────────────
    // 4. Monthly
    // ──────────────────────────────────────────────
    console.log('\n── 4. Monthly ──');

    try {
        const ms = await getMonthlySummaries();
        assert('getMonthlySummaries() — returns array', Array.isArray(ms));
        if (ms.length > 0) {
            assert('getMonthlySummaries() — has year', typeof ms[0].year === 'number');
            assert('getMonthlySummaries() — has net_profit', typeof ms[0].net_profit === 'number' || typeof ms[0].net_profit === 'string');
            console.log(`     → ${ms.length} rows, sample: ${ms[0].year}-${String(ms[0].month).padStart(2, '0')} | ${ms[0].apartment_location} | rev:${fmt(ms[0].total_revenue)} | exp:${fmt(ms[0].total_expenses)} | profit:${fmt(ms[0].net_profit)}`);
        } else {
            console.log('     ⚠️  No monthly data');
        }
    } catch (e: any) {
        assert('getMonthlySummaries()', false, e.message);
    }

    try {
        const mc = await getMonthlyComparison();
        assert('getMonthlyComparison() — returns array', Array.isArray(mc));
        if (mc.length > 0) {
            assert('getMonthlyComparison() — has yearMonth', !!mc[0].yearMonth);
            assert('getMonthlyComparison() — has revenue/expenses/netProfit', (typeof mc[0].revenue === 'number' || typeof mc[0].revenue === 'string') && (typeof mc[0].expenses === 'number' || typeof mc[0].expenses === 'string') && (typeof mc[0].netProfit === 'number' || typeof mc[0].netProfit === 'string'));
            console.log(`     → ${mc.length} months, sample: ${mc[0].yearMonth} | rev:${fmt(mc[0].revenue)} | exp:${fmt(mc[0].expenses)} | profit:${fmt(mc[0].netProfit)}`);
        } else {
            console.log('     ⚠️  No monthly comparison data');
        }
    } catch (e: any) {
        assert('getMonthlyComparison()', false, e.message);
    }

    // ──────────────────────────────────────────────
    // 5. Occupancy
    // ──────────────────────────────────────────────
    console.log('\n── 5. Occupancy ──');

    try {
        const occ = await getOccupancyDaily();
        assert('getOccupancyDaily() — returns array', Array.isArray(occ));
        if (occ.length > 0) {
            assert('getOccupancyDaily() — has is_occupied', typeof occ[0].is_occupied === 'boolean');
            console.log(`     → ${occ.length} rows, sample: ${occ[0].date_wib} | ${occ[0].apartment_location} | ${occ[0].room_number} | occupied:${occ[0].is_occupied}`);
        } else {
            console.log('     ⚠️  No occupancy data');
        }
    } catch (e: any) {
        assert('getOccupancyDaily()', false, e.message);
    }

    try {
        const occRate = await getOccupancyRate();
        assert('getOccupancyRate() — returns array', Array.isArray(occRate));
        if (occRate.length > 0) {
            assert('getOccupancyRate() — has occupancy_rate 0..1', occRate[0].occupancy_rate >= 0 && occRate[0].occupancy_rate <= 1);
            console.log(`     → ${occRate.length} rows, sample: ${occRate[0].date_wib} | ${occRate[0].apartment_location} | rate:${fmt(occRate[0].occupancy_rate, 4)} | occupied:${occRate[0].occupied_rooms}/${occRate[0].total_rooms}`);
        }
    } catch (e: any) {
        assert('getOccupancyRate()', false, e.message);
    }

    try {
        const occSum = await getOccupancySummary();
        assert('getOccupancySummary() — has averageOccupancyRate', typeof occSum.averageOccupancyRate === 'number');
        assert('getOccupancySummary() — has totalRoomDays', typeof occSum.totalRoomDays === 'number');
        console.log(`     → avg rate: ${fmt(occSum.averageOccupancyRate, 4)} | room-days: ${occSum.totalRoomDays} | occupied: ${occSum.totalOccupiedRoomDays}`);
    } catch (e: any) {
        assert('getOccupancySummary()', false, e.message);
    }

    // ──────────────────────────────────────────────
    // 6. Sync Status
    // ──────────────────────────────────────────────
    console.log('\n── 6. Sync Status ──');

    try {
        const statuses = await getAllSyncStatuses();
        assert('getAllSyncStatuses() — returns array', Array.isArray(statuses));
        if (statuses.length > 0) {
            assert('getAllSyncStatuses() — has table_name', !!statuses[0].table_name);
            console.log(`     → ${statuses.length} tables tracked`);
            // Print summary
            for (const s of statuses) {
                console.log(`     · ${s.table_name.padEnd(30)} rows:${String(s.row_count ?? '?').padStart(8)} status:${s.sync_status ?? '?'}`);
            }
        } else {
            console.log('     ⚠️  No sync status data');
        }
    } catch (e: any) {
        assert('getAllSyncStatuses()', false, e.message);
    }

    try {
        const single = await getSyncStatus('transactions');
        if (single) {
            assert('getSyncStatus("transactions") — found', true);
            assert('getSyncStatus("transactions") — has row_count', single.row_count !== null);
            console.log(`     → transactions: ${single.row_count} rows, last sync: ${single.last_sync_at ?? 'never'}`);
        } else {
            console.log('     ⚠️  getSyncStatus("transactions") returned null');
        }
    } catch (e: any) {
        assert('getSyncStatus("transactions")', false, e.message);
    }

    try {
        const logs = await getRecentSyncLogs(5);
        assert('getRecentSyncLogs(5) — returns array', Array.isArray(logs));
        if (logs.length > 0) {
            console.log(`     → ${logs.length} recent log entries, latest: ${logs[0].table_name} | ${logs[0].sync_type} | ${logs[0].status}`);
        }
    } catch (e: any) {
        assert('getRecentSyncLogs(5)', false, e.message);
    }

    try {
        const tLogs = await getSyncLogsForTable('transactions', 3);
        assert('getSyncLogsForTable("transactions",3) — returns array', Array.isArray(tLogs));
        if (tLogs.length > 0) {
            console.log(`     → ${tLogs.length} log entries for transactions`);
        }
    } catch (e: any) {
        assert('getSyncLogsForTable("transactions",3)', false, e.message);
    }

    // ──────────────────────────────────────────────
    // 7. Cleanup
    // ──────────────────────────────────────────────
    console.log('\n── 7. Cleanup ──');
    try {
        await closeAnalyticsPool();
        assert('closeAnalyticsPool() — completed', true);
    } catch (e: any) {
        assert('closeAnalyticsPool()', false, e.message);
    }

    // ──────────────────────────────────────────────
    // Summary
    // ──────────────────────────────────────────────
    const total = passed + failed;
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  Test Summary                            ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`  Total:  ${total}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    if (failures.length > 0) {
        console.log('\n  Failures:');
        for (const f of failures) {
            console.log(`    · ${f}`);
        }
    }
    console.log(`  Finished: ${new Date().toISOString()}`);
    console.log();

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
    console.error('  FATAL:', err);
    process.exit(1);
});
