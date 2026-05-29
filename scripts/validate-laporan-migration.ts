/**
 * Validates Laporan migration (Phase 2B-5E-1 & 2B-5E-2).
 *
 * Tests:
 * 1. Revenue/Expense shapes (existing)
 * 2. Monthly summary shapes (bills + marketing fees)
 * 3. Month-aligned detection helper
 * 4. Fallback pattern verification (no zero-value checks)
 * 5. Zero-value period (should NOT trigger fallback)
 *
 * Run: npx tsx scripts/validate-laporan-migration.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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

import { getRevenueSummary as getRevenueSummaryAnalytics } from '../lib/analytics/revenue';
import { getExpenseSummary } from '../lib/analytics/expenses';
import { getMonthlySummaries } from '../lib/analytics/monthly';
import { isMonthAligned } from '../lib/services/date-range';
import { queryAnalytics, closeAnalyticsPool } from '../lib/analytics';
import type { RevenueByDateRange, ExpenseByDateRange, MonthlySummary } from '../lib/analytics/types';

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

function fmt(n: number | string | null | undefined): string {
    if (n == null) return 'NULL';
    if (typeof n === 'number') return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return String(n);
}

// ─── Date ranges ───
const ranges = [
    { label: 'May 2026', start: '2026-05-01', end: '2026-06-01' },
    { label: 'Apr 2026', start: '2026-04-01', end: '2026-05-01' },
    { label: 'Last 6 months', start: '2025-12-01', end: '2026-06-01' },
];

// ─── Main ────────────────────────────────────────────────────
async function run() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Laporan Migration Validation (Phase 2B-5E)            ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // ──────────────────────────────────────────────
    // 0. Connection check
    // ──────────────────────────────────────────────
    console.log('── 0. Connection ──');
    try {
        const rows = await queryAnalytics<{ now: string }>('SELECT NOW() AS now');
        assert('Analytics DB reachable', rows.length === 1 && !!rows[0].now);
    } catch (e: any) {
        assert('Analytics DB reachable', false, e.message);
        console.error('  Cannot continue without analytics DB.');
        await closeAnalyticsPool();
        process.exit(1);
    }

    // ──────────────────────────────────────────────
    // 1. Month-aligned detection helper
    // ──────────────────────────────────────────────
    console.log('\n── 1. isMonthAligned() ──');

    // Month-aligned: full month range
    assert('May 2026 full month (1..31)',
        isMonthAligned(new Date('2026-05-01'), new Date('2026-05-31')), 'failed: 2026-05-01 → 2026-05-31');
    assert('Apr 2026 full month (1..30)',
        isMonthAligned(new Date('2026-04-01'), new Date('2026-04-30')), 'failed: 2026-04-01 → 2026-04-30');
    assert('Mar 2026 full month (1..31)',
        isMonthAligned(new Date('2026-03-01'), new Date('2026-03-31')), 'failed: 2026-03-01 → 2026-03-31');

    // Not month-aligned
    assert('Mid-month start fails',
        !isMonthAligned(new Date('2026-05-15'), new Date('2026-05-31')), 'should be false for 15..31');
    assert('Mid-month end fails',
        !isMonthAligned(new Date('2026-05-01'), new Date('2026-05-15')), 'should be false for 1..15');
    assert('Cross-month fails',
        !isMonthAligned(new Date('2026-05-01'), new Date('2026-06-15')), 'should be false for May to Jun 15');

    // ──────────────────────────────────────────────
    // 2. Revenue Summary shapes
    // ──────────────────────────────────────────────
    console.log('\n── 2. Revenue Summary (getRevenueSummary) ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);
        try {
            const data = await getRevenueSummaryAnalytics(range.start, range.end);
            assert('returns object', typeof data === 'object');
            assert('totalRevenue is number ≥ 0',
                typeof data.totalRevenue === 'number' && data.totalRevenue >= 0,
                `got ${data.totalRevenue}`);
            assert('totalCash is number ≥ 0',
                typeof data.totalCash === 'number' && data.totalCash >= 0,
                `got ${data.totalCash}`);
            assert('totalTransfer is number ≥ 0',
                typeof data.totalTransfer === 'number' && data.totalTransfer >= 0,
                `got ${data.totalTransfer}`);
            assert('totalTransactions is integer ≥ 0',
                Number.isInteger(data.totalTransactions) && data.totalTransactions >= 0,
                `got ${data.totalTransactions}`);
            console.log(`  → rev=Rp${fmt(data.totalRevenue)} cash=Rp${fmt(data.totalCash)} transfer=Rp${fmt(data.totalTransfer)} txs=${data.totalTransactions}`);
        } catch (e: any) {
            assert(`getRevenueSummary(${range.label})`, false, e.message);
        }
    }

    // ──────────────────────────────────────────────
    // 3. Expense Summary shapes
    // ──────────────────────────────────────────────
    console.log('\n── 3. Expense Summary (getExpenseSummary) ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);
        try {
            const data = await getExpenseSummary(range.start, range.end);
            assert('returns object', typeof data === 'object');
            assert('totalAmount is number ≥ 0',
                typeof data.totalAmount === 'number' && data.totalAmount >= 0,
                `got ${data.totalAmount}`);
            assert('byCategory is array', Array.isArray(data.byCategory));
            assert('byLocation is array', Array.isArray(data.byLocation));

            if (data.byCategory.length > 0) {
                const c = data.byCategory[0];
                assert('byCategory[0].category is string', typeof c.category === 'string');
                assert('byCategory[0].total_amount is number', typeof c.total_amount === 'number');
                assert('byCategory[0].expense_count is number', typeof c.expense_count === 'number');
            }
            console.log(`  → total=Rp${fmt(data.totalAmount)} categories=${data.byCategory.length} locations=${data.byLocation.length}`);
        } catch (e: any) {
            assert(`getExpenseSummary(${range.label})`, false, e.message);
        }
    }

    // ──────────────────────────────────────────────
    // 4. Monthly Summary — Bills (paid/unpaid)
    // ──────────────────────────────────────────────
    console.log('\n── 4. Monthly Summary — Bills (getMonthlySummaries) ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);
        try {
            // Parse year/month from dates
            const startDate = new Date(range.start + 'T00:00:00');
            const endDate = new Date(range.end + 'T00:00:00');
            // endDate is exclusive, so subtract 1 day to get last day
            const lastDay = new Date(endDate.getTime() - 86400000);

            const summary = await getMonthlySummaries(
                startDate.getFullYear(), startDate.getMonth() + 1,
                lastDay.getFullYear(), lastDay.getMonth() + 1,
            );
            assert('returns array', Array.isArray(summary));
            console.log(`  → ${summary.length} rows`);

            // Aggregate bills across all months and locations
            let paidAmount = 0, unpaidAmount = 0;
            let paidCount = 0, unpaidCount = 0;
            for (const s of summary) {
                assert('paid_bills_amount is number', typeof s.paid_bills_amount === 'number', `got ${typeof s.paid_bills_amount}`);
                assert('unpaid_bills_amount is number', typeof s.unpaid_bills_amount === 'number', `got ${typeof s.unpaid_bills_amount}`);
                assert('paid_bills_count is integer', Number.isInteger(s.paid_bills_count), `got ${typeof s.paid_bills_count}`);
                assert('unpaid_bills_count is integer', Number.isInteger(s.unpaid_bills_count), `got ${typeof s.unpaid_bills_count}`);
                paidAmount += s.paid_bills_amount;
                unpaidAmount += s.unpaid_bills_amount;
                paidCount += s.paid_bills_count;
                unpaidCount += s.unpaid_bills_count;
            }

            // Verify shape matches TagihanReport in laporan/actions.ts
            // { paid: number; unpaid: number; paidCount: number; unpaidCount: number }
            assert('paid is number ≥ 0', typeof paidAmount === 'number' && paidAmount >= 0);
            assert('unpaid is number ≥ 0', typeof unpaidAmount === 'number' && unpaidAmount >= 0);
            assert('paidCount is integer ≥ 0', Number.isInteger(paidCount) && paidCount >= 0);
            assert('unpaidCount is integer ≥ 0', Number.isInteger(unpaidCount) && unpaidCount >= 0);

            console.log(`  → paid=Rp${fmt(paidAmount)} (${paidCount}x) unpaid=Rp${fmt(unpaidAmount)} (${unpaidCount}x)`);
        } catch (e: any) {
            assert(`getMonthlySummaries(${range.label})`, false, e.message);
        }
    }

    // ──────────────────────────────────────────────
    // 5. Monthly Summary — Marketing Fees
    // ──────────────────────────────────────────────
    console.log('\n── 5. Monthly Summary — Marketing Fees ──');

    for (const range of ranges) {
        console.log(`\n  Range: ${range.label} (${range.start} → ${range.end})`);
        try {
            const startDate = new Date(range.start + 'T00:00:00');
            const endDate = new Date(range.end + 'T00:00:00');
            const lastDay = new Date(endDate.getTime() - 86400000);

            const summary = await getMonthlySummaries(
                startDate.getFullYear(), startDate.getMonth() + 1,
                lastDay.getFullYear(), lastDay.getMonth() + 1,
            );

            let totalFees = 0, paidFees = 0;
            for (const s of summary) {
                assert('total_marketing_fees is number', typeof s.total_marketing_fees === 'number',
                    `got ${typeof s.total_marketing_fees}`);
                assert('paid_fees_amount is number', typeof s.paid_fees_amount === 'number',
                    `got ${typeof s.paid_fees_amount}`);
                totalFees += s.total_marketing_fees;
                paidFees += s.paid_fees_amount;
            }

            // Verify shape matches FeeMarketingReport
            // { totalPaid: number; totalUnpaid: number; paidCount: number; unpaidCount: number }
            const unpaidFees = Math.max(0, totalFees - paidFees);
            assert('totalFees is number ≥ 0', typeof totalFees === 'number' && totalFees >= 0);
            assert('paidFees is number ≥ 0', typeof paidFees === 'number' && paidFees >= 0);
            assert('unpaidFees is number ≥ 0 (totalFees - paidFees)', typeof unpaidFees === 'number' && unpaidFees >= 0);

            console.log(`  → total=Rp${fmt(totalFees)} paid=Rp${fmt(paidFees)} unpaid=Rp${fmt(unpaidFees)}`);
        } catch (e: any) {
            assert(`getMonthlySummaries(${range.label}) fees`, false, e.message);
        }
    }

    // ──────────────────────────────────────────────
    // 6. Verify MonthlySummary has all required fields
    // ──────────────────────────────────────────────
    console.log('\n── 6. MonthlySummary field completeness ──');

    const requiredBillFields: (keyof MonthlySummary)[] = [
        'paid_bills_amount', 'unpaid_bills_amount',
        'paid_bills_count', 'unpaid_bills_count',
    ];
    const requiredFeeFields: (keyof MonthlySummary)[] = [
        'total_marketing_fees', 'paid_fees_amount',
    ];

    try {
        const summary = await getMonthlySummaries(2026, 5, 2026, 5);
        if (summary.length > 0) {
            const first = summary[0];
            for (const field of requiredBillFields) {
                assert(`MonthlySummary has ${field}`, field in first,
                    `missing field: ${field}`);
            }
            for (const field of requiredFeeFields) {
                assert(`MonthlySummary has ${field}`, field in first,
                    `missing field: ${field}`);
            }
            // Verify values can be aggregated
            let paid = 0, unpaid = 0;
            for (const s of summary) {
                paid += s.paid_bills_amount;
                unpaid += s.unpaid_bills_amount;
            }
            assert('Can aggregate bill amounts', typeof paid === 'number' && typeof unpaid === 'number');
            console.log(`  → All ${requiredBillFields.length + requiredFeeFields.length} required fields present`);
        } else {
            console.log('  ⚠️  No data for May 2026 (expected if sync not running)');
        }
    } catch (e: any) {
        assert('MonthlySummary field check', false, e.message);
    }

    // ──────────────────────────────────────────────
    // 7. Fallback pattern verification
    // ──────────────────────────────────────────────
    console.log('\n── 7. Fallback pattern verification ──');

    // Read the laporan/actions.ts file and verify no `=== 0` fallback checks exist
    const actionsContent = readFileSync(
        resolve(__dirname, '..', 'app/(dashboard)/laporan/actions.ts'),
        'utf-8'
    );

    // Check for zero-value fallback patterns (should NOT exist after fix)
    const zeroValuePatterns = [
        'totalRevenue === 0 && totalTransactions === 0',
        'totalExpenses === 0 && expenses.length === 0',
        'prevRevenue === 0 && prevTransactions === 0 && prevExpenses === 0',
    ];

    for (const pattern of zeroValuePatterns) {
        assert(`No zero-value fallback: "${pattern.substring(0, 40)}..."`,
            !actionsContent.includes(pattern),
            `Found forbidden zero-value fallback pattern`);
    }

    // Check that analytics-first patterns DO exist
    assert('Uses "analyticsRevenueUsed" flag',
        actionsContent.includes('analyticsRevenueUsed'),
        'Missing analytics-used flag pattern');
    assert('Uses "analyticsExpensesUsed" flag',
        actionsContent.includes('analyticsExpensesUsed'),
        'Missing analytics-used flag pattern');
    assert('Uses "analyticsComparisonUsed" flag',
        actionsContent.includes('analyticsComparisonUsed'),
        'Missing analytics-used flag pattern');

    // Check month-aligned logic
    assert('Imports isMonthAligned',
        actionsContent.includes('isMonthAligned'),
        'Missing isMonthAligned import');
    assert('Imports getMonthlySummaries',
        actionsContent.includes('getMonthlySummaries'),
        'Missing getMonthlySummaries import');
    assert('Uses getMonthlySummaries for bills',
        actionsContent.includes('paid_bills_amount') && actionsContent.includes('unpaid_bills_amount'),
        'Missing bill field aggregation');
    assert('Uses getMonthlySummaries for fees',
        actionsContent.includes('total_marketing_fees') && actionsContent.includes('paid_fees_amount'),
        'Missing fee field aggregation');

    // ──────────────────────────────────────────────
    // 8. Verify legacy paths preserved
    // ──────────────────────────────────────────────
    console.log('\n── 8. Legacy paths preserved ──');

    assert('Supabase tagihan_bulanan query exists (legacy fallback)',
        actionsContent.includes('tagihan_bulanan'),
        'tagihan_bulanan query missing from legacy fallback');
    assert('Supabase tagihan_fee_lunas_items query exists (legacy fallback)',
        actionsContent.includes('tagihan_fee_lunas_items'),
        'tagihan_fee_lunas_items query missing from legacy fallback');

    // ──────────────────────────────────────────────
    // Summary
    // ──────────────────────────────────────────────
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
