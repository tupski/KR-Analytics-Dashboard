/**
 * Validate Expense Service — Phase 2B-5C
 *
 * Tests expense service functions against direct SQL from local analytics DB.
 * Validates shape, numeric types, and value accuracy across date ranges:
 *   - Today
 *   - This month (May 2026)
 *   - Last 6 months
 *   - All time
 *
 * Usage:
 *   npx tsx scripts/validate-expense-service.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { format, subMonths, startOfMonth } from 'date-fns';

// ─── Bootstrap ANALYTICS_DATABASE_URL ───
if (!process.env.ANALYTICS_DATABASE_URL) {
    const swEnvPath = resolve(__dirname, '..', 'sync-worker', '.env');
    if (existsSync(swEnvPath)) {
        const contents = readFileSync(swEnvPath, 'utf-8');
        for (const line of contents.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            process.env[key] = val;
        }
        const host = process.env.LOCAL_DB_HOST || 'localhost';
        const port = process.env.LOCAL_DB_PORT || '5433';
        const db = process.env.LOCAL_DB_NAME || 'kr_analytics';
        const user = process.env.LOCAL_DB_USER || 'analytics';
        const pass = process.env.LOCAL_DB_PASSWORD || 'analytics_dev_password';
        process.env.ANALYTICS_DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
        console.log('[bootstrap] ANALYTICS_DATABASE_URL from sync-worker/.env');
    } else {
        console.error('[bootstrap] FATAL: ANALYTICS_DATABASE_URL not set and sync-worker/.env not found.');
        process.exit(1);
    }
}

// ─── Imports — service + direct analytics query ───
import {
    getExpenseSummary,
    getExpensesByCategory,
    getExpensesByLocation,
    getExpenseTrend,
} from '../lib/services/expense';
import { queryAnalytics, closeAnalyticsPool } from '../lib/analytics';
import { parseNumeric } from '../lib/analytics/db';

// ─── Helpers ─────────────────────────────────────────
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

function fmt(n: number | string | null | undefined): string {
    if (n == null) return 'NULL';
    if (typeof n === 'number') return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return String(n);
}

/** Date ranges (WIB) */
const today = new Date();
const todayStr = format(today, 'yyyy-MM-dd');
const todayEnd = format(new Date(today.getTime() + 86400000), 'yyyy-MM-dd');

const monthStart = '2026-05-01';
const monthEnd = '2026-06-01';

const sixMonthsAgo = format(subMonths(startOfMonth(today), 5), 'yyyy-MM-dd');
const sixMonthsEnd = todayEnd;

const allTimeStart = '2020-01-01';
const allTimeEnd = todayEnd;

interface Range {
    label: string;
    start: string;
    end: string;
}

const ranges: Range[] = [
    { label: 'Today', start: todayStr, end: todayEnd },
    { label: 'This month (May)', start: monthStart, end: monthEnd },
    { label: 'Last 6 months', start: sixMonthsAgo, end: sixMonthsEnd },
    { label: 'All time', start: allTimeStart, end: allTimeEnd },
];

// ─── Direct SQL helpers (for cross-validation) ────────

interface DirectTotals {
    total_amount: number;
    total_expenses: number;
}

async function getDirectTotals(start: string, end: string): Promise<DirectTotals> {
    const rows = await queryAnalytics<{ total_amount: string; total_expenses: string }>(
        `SELECT
            COALESCE(SUM(total_amount), 0) AS total_amount,
            COUNT(*)::text AS total_expenses
         FROM analytics_expense_summary
         WHERE date_wib >= $1 AND date_wib < $2`,
        [start, end]
    );
    const r = rows[0];
    return {
        total_amount: parseNumeric(r.total_amount),
        total_expenses: parseNumeric(r.total_expenses),
    };
}

interface DirectCategory {
    category: string;
    total_amount: number;
    expense_count: number;
}

async function getDirectByCategory(start: string, end: string): Promise<DirectCategory[]> {
    const rows = await queryAnalytics<{ category: string; total_amount: string; expense_count: string }>(
        `SELECT
            category,
            SUM(total_amount) AS total_amount,
            SUM(expense_count) AS expense_count
         FROM analytics_expense_summary
         WHERE date_wib >= $1 AND date_wib < $2
         GROUP BY category
         ORDER BY total_amount DESC`,
        [start, end]
    );
    return rows.map(r => ({
        category: r.category,
        total_amount: parseNumeric(r.total_amount),
        expense_count: parseNumeric(r.expense_count),
    }));
}

interface DirectLocation {
    apartment_location: string;
    total_amount: number;
    expense_count: number;
}

async function getDirectByLocation(start: string, end: string): Promise<DirectLocation[]> {
    const rows = await queryAnalytics<{ apartment_location: string; total_amount: string; expense_count: string }>(
        `SELECT
            apartment_location,
            SUM(total_amount) AS total_amount,
            SUM(expense_count) AS expense_count
         FROM analytics_expense_summary
         WHERE date_wib >= $1 AND date_wib < $2
         GROUP BY apartment_location
         ORDER BY total_amount DESC`,
        [start, end]
    );
    return rows.map(r => ({
        apartment_location: r.apartment_location,
        total_amount: parseNumeric(r.total_amount),
        expense_count: parseNumeric(r.expense_count),
    }));
}

interface DirectTrend {
    date: string;
    total_amount: number;
    expense_count: number;
}

async function getDirectByDay(start: string, end: string): Promise<DirectTrend[]> {
    const rows = await queryAnalytics<{ date_wib: string; total_amount: string; expense_count: string }>(
        `SELECT
            date_wib::text,
            SUM(total_amount) AS total_amount,
            SUM(expense_count) AS expense_count
         FROM analytics_expense_summary
         WHERE date_wib >= $1 AND date_wib < $2
         GROUP BY date_wib
         ORDER BY date_wib`,
        [start, end]
    );
    return rows.map(r => ({
        date: r.date_wib.split('T')[0],
        total_amount: parseNumeric(r.total_amount),
        expense_count: parseNumeric(r.expense_count),
    }));
}

// ─── Main ─────────────────────────────────────────────
async function run() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Expense Service Validation (Phase 2B-5C)               ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // ─── 1. Connection ───────────────────────────────
    console.log('── 1. Connection ──');
    try {
        const rows = await queryAnalytics<{ now: string }>('SELECT NOW() AS now');
        assert('Analytics DB reachable', rows.length === 1 && !!rows[0].now, `got: ${rows[0]?.now}`);
    } catch (e: any) {
        assert('Analytics DB reachable', false, e.message);
        console.error('  Cannot continue without analytics DB.');
        process.exit(1);
    }

    // ─── 2. getExpenseSummary shape + numeric types ──
    console.log('\n── 2. getExpenseSummary (shape + numeric types) ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);
        try {
            const summary = await getExpenseSummary(range.start, range.end);
            assert('returns object', typeof summary === 'object');
            assert('totalAmount is number', typeof summary.totalAmount === 'number', `got ${typeof summary.totalAmount}`);
            assert('totalExpenses is number', typeof summary.totalExpenses === 'number', `got ${typeof summary.totalExpenses}`);
            assert('startDate matches', summary.startDate === range.start, `expected ${range.start} got ${summary.startDate}`);
            assert('endDate matches', summary.endDate === range.end, `expected ${range.end} got ${summary.endDate}`);
            assert('byCategory is array', Array.isArray(summary.byCategory));
            assert('byLocation is array', Array.isArray(summary.byLocation));

            // Cross-validate totals vs direct SQL
            const direct = await getDirectTotals(range.start, range.end);
            assert('totalAmount ≈ direct SQL', summary.totalAmount === direct.total_amount,
                `service=${summary.totalAmount} direct=${direct.total_amount}`);
            assert('totalExpenses ≈ direct SQL', summary.totalExpenses === direct.total_expenses,
                `service=${summary.totalExpenses} direct=${direct.total_expenses}`);

            if (summary.byCategory.length > 0) {
                const cat = summary.byCategory[0];
                assert('byCategory[0].category is string', typeof cat.category === 'string');
                assert('byCategory[0].total_amount is number', typeof cat.total_amount === 'number');
                assert('byCategory[0].expense_count is number', typeof cat.expense_count === 'number');
            }

            if (summary.byLocation.length > 0) {
                const loc = summary.byLocation[0];
                assert('byLocation[0].apartment_location is string', typeof loc.apartment_location === 'string');
                assert('byLocation[0].total_amount is number', typeof loc.total_amount === 'number');
                assert('byLocation[0].expense_count is number', typeof loc.expense_count === 'number');
            }

            // Cross-validate category counts
            const directCats = await getDirectByCategory(range.start, range.end);
            assert('byCategory count matches', summary.byCategory.length === directCats.length,
                `service=${summary.byCategory.length} direct=${directCats.length}`);
            if (summary.byCategory.length > 0 && directCats.length > 0) {
                assert('top category match', summary.byCategory[0].category === directCats[0].category,
                    `service=${summary.byCategory[0].category} direct=${directCats[0].category}`);
                assert('top category amount match', summary.byCategory[0].total_amount === directCats[0].total_amount,
                    `service=${summary.byCategory[0].total_amount} direct=${directCats[0].total_amount}`);
            }

            // Cross-validate location counts
            const directLocs = await getDirectByLocation(range.start, range.end);
            assert('byLocation count matches', summary.byLocation.length === directLocs.length,
                `service=${summary.byLocation.length} direct=${directLocs.length}`);

            console.log(`  → total: Rp${fmt(summary.totalAmount)} | count: ${summary.totalExpenses} | cats: ${summary.byCategory.length} | locs: ${summary.byLocation.length}`);
        } catch (e: any) {
            assert(`getExpenseSummary(${range.label})`, false, e.message);
        }
    }

    // ─── 3. getExpensesByCategory (with percentage) ──
    console.log('\n── 3. getExpensesByCategory (+ percentage check) ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);
        try {
            const cats = await getExpensesByCategory(range.start, range.end);
            assert('returns array', Array.isArray(cats));
            assert('sorted by total_amount DESC', cats.length <= 1 || cats[0].total_amount >= (cats[1]?.total_amount ?? 0));

            if (cats.length > 0) {
                const c = cats[0];
                assert('category is string', typeof c.category === 'string');
                assert('total_amount is number', typeof c.total_amount === 'number');
                assert('expense_count is number', typeof c.expense_count === 'number');
                assert('percentage is number', typeof c.percentage === 'number');
                assert('percentage between 0-100', c.percentage >= 0 && c.percentage <= 100,
                    `got ${c.percentage}`);
            }

            // Verify percentages sum approximately to 100
            if (cats.length > 0) {
                const totalPct = cats.reduce((s, c) => s + c.percentage, 0);
                // Allow rounding diff up to 2%
                assert('percentages sum ≈ 100', Math.abs(totalPct - 100) <= 2,
                    `sum=${totalPct}%`);
            }

            console.log(`  → ${cats.length} categories`);
            for (const c of cats) {
                console.log(`  · ${c.category.padEnd(25)} Rp${fmt(c.total_amount).padStart(12)} (${c.percentage}%)`);
            }
        } catch (e: any) {
            assert(`getExpensesByCategory(${range.label})`, false, e.message);
        }
    }

    // ─── 4. getExpensesByLocation ────────────────────
    console.log('\n── 4. getExpensesByLocation ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);
        try {
            const locs = await getExpensesByLocation(range.start, range.end);
            assert('returns array', Array.isArray(locs));
            assert('sorted by total_amount DESC', locs.length <= 1 || locs[0].total_amount >= (locs[1]?.total_amount ?? 0));

            if (locs.length > 0) {
                const l = locs[0];
                assert('apartment_location is string', typeof l.apartment_location === 'string');
                assert('total_amount is number', typeof l.total_amount === 'number');
                assert('expense_count is number', typeof l.expense_count === 'number');
            }

            // Cross-validate with direct SQL
            const directLocs = await getDirectByLocation(range.start, range.end);
            assert('location count matches', locs.length === directLocs.length,
                `service=${locs.length} direct=${directLocs.length}`);
            if (locs.length > 0 && directLocs.length > 0) {
                assert('top location matches', locs[0].apartment_location === directLocs[0].apartment_location);
                assert('top location amount matches', locs[0].total_amount === directLocs[0].total_amount);
            }

            console.log(`  → ${locs.length} locations`);
            for (const l of locs) {
                console.log(`  · ${l.apartment_location.padEnd(20)} Rp${fmt(l.total_amount).padStart(12)} (${l.expense_count}x)`);
            }
        } catch (e: any) {
            assert(`getExpensesByLocation(${range.label})`, false, e.message);
        }
    }

    // ─── 5. getExpenseTrend (daily + monthly) ──────
    console.log('\n── 5. getExpenseTrend ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);

        // Daily trend
        console.log('  Mode: day');
        try {
            const trend = await getExpenseTrend(range.start, range.end, 'day');
            assert('returns array', Array.isArray(trend));

            if (trend.length > 0) {
                const t = trend[0];
                assert('date is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(t.date), `got ${t.date}`);
                assert('total_amount is number', typeof t.total_amount === 'number');
                assert('expense_count is number', typeof t.expense_count === 'number');
                assert('sorted by date asc', trend.length <= 1 || trend[0].date <= trend[trend.length - 1].date);

                // Cross-validate totals match direct SQL
                const directTotal = trend.reduce((s, t) => s + t.total_amount, 0);
                const direct = await getDirectTotals(range.start, range.end);
                assert('trend sum ≈ direct SQL total', Math.abs(directTotal - direct.total_amount) <= 1,
                    `trendSum=${directTotal} direct=${direct.total_amount}`);
            } else {
                console.log('  ⚠️  No daily trend data');
            }
            console.log(`  → ${trend.length} daily points`);
        } catch (e: any) {
            assert(`getExpenseTrend(${range.label}, day)`, false, e.message);
        }

        // Monthly trend
        console.log('  Mode: month');
        try {
            const monthly = await getExpenseTrend(range.start, range.end, 'month');
            assert('returns array', Array.isArray(monthly));

            if (monthly.length > 0) {
                const m = monthly[0];
                assert('date is YYYY-MM', /^\d{4}-\d{2}$/.test(m.date), `got ${m.date}`);
                assert('total_amount is number', typeof m.total_amount === 'number');
                assert('expense_count is number', typeof m.expense_count === 'number');
            }
            console.log(`  → ${monthly.length} monthly points`);
        } catch (e: any) {
            assert(`getExpenseTrend(${range.label}, month)`, false, e.message);
        }
    }

    // ─── 6. All amounts are typeof number (deep check) ──
    console.log('\n── 6. Deep numeric type assertions ──');

    const allTimeSummary = await getExpenseSummary(allTimeStart, allTimeEnd);
    assert('totalAmount is number (not string)', typeof allTimeSummary.totalAmount === 'number',
        `got ${typeof allTimeSummary.totalAmount}: ${allTimeSummary.totalAmount}`);
    assert('totalExpenses is number (not string)', typeof allTimeSummary.totalExpenses === 'number',
        `got ${typeof allTimeSummary.totalExpenses}: ${allTimeSummary.totalExpenses}`);

    for (const cat of allTimeSummary.byCategory) {
        assert(`category "${cat.category}" total_amount is number`, typeof cat.total_amount === 'number',
            `got ${typeof cat.total_amount}`);
        assert(`category "${cat.category}" expense_count is number`, typeof cat.expense_count === 'number',
            `got ${typeof cat.expense_count}`);
    }

    for (const loc of allTimeSummary.byLocation) {
        assert(`location "${loc.apartment_location}" total_amount is number`, typeof loc.total_amount === 'number',
            `got ${typeof loc.total_amount}`);
        assert(`location "${loc.apartment_location}" expense_count is number`, typeof loc.expense_count === 'number',
            `got ${typeof loc.expense_count}`);
    }

    const allTimeCats = await getExpensesByCategory(allTimeStart, allTimeEnd);
    for (const c of allTimeCats) {
        assert(`cat-breakdown "${c.category}" percentage is number`, typeof c.percentage === 'number',
            `got ${typeof c.percentage}`);
    }

    const allTimeTrend = await getExpenseTrend(allTimeStart, allTimeEnd, 'day');
    for (const t of allTimeTrend) {
        assert(`trend "${t.date}" total_amount is number`, typeof t.total_amount === 'number',
            `got ${typeof t.total_amount}`);
        assert(`trend "${t.date}" expense_count is number`, typeof t.expense_count === 'number',
            `got ${typeof t.expense_count}`);
    }

    // ─── 7. Default arguments test (no args) ──────
    console.log('\n── 7. Default arguments (no args = last 30 days) ──');

    try {
        const defaultSummary = await getExpenseSummary();
        assert('returns object when no args', typeof defaultSummary === 'object');
        assert('totalAmount is number', typeof defaultSummary.totalAmount === 'number');
        assert('totalExpenses is number', typeof defaultSummary.totalExpenses === 'number');
        assert('startDate present', typeof defaultSummary.startDate === 'string' && defaultSummary.startDate.length === 10);
        assert('endDate present', typeof defaultSummary.endDate === 'string' && defaultSummary.endDate.length === 10);
        console.log(`  → default range: ${defaultSummary.startDate} → ${defaultSummary.endDate}`);
        console.log(`  → total: Rp${fmt(defaultSummary.totalAmount)} | count: ${defaultSummary.totalExpenses}`);

        const defaultCats = await getExpensesByCategory();
        assert('byCategory works with no args', Array.isArray(defaultCats));

        const defaultLocs = await getExpensesByLocation();
        assert('byLocation works with no args', Array.isArray(defaultLocs));

        const defaultTrend = await getExpenseTrend();
        assert('trend works with no args', Array.isArray(defaultTrend));
    } catch (e: any) {
        assert('default args (no args)', false, e.message);
    }

    // ─── 8. Summary ───────────────────────────────
    const total = passed + failed;
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Validation Summary                                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  Total:  ${total}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    if (failures.length > 0) {
        console.log('\n  Failures:');
        for (const f of failures) {
            console.log(`    · ${f}`);
        }
    }
    console.log(`\n  Finished: ${new Date().toISOString()}`);

    await closeAnalyticsPool();
    process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('  FATAL:', err);
    process.exit(1);
});
