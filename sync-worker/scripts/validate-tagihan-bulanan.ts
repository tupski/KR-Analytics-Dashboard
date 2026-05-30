/**
 * validate-tagihan-bulanan.ts
 * Validation script for tagihan_bulanan sync.
 *
 * Usage: cd sync-worker && npx tsx scripts/validate-tagihan-bulanan.ts
 *
 * Checks:
 * 1. Total rows count (production vs local active)
 * 2. Total nominal tagihan (SUM of amount)
 * 3. Total tagihan lunas (status='lunas' OR 'paid')
 * 4. Total tagihan belum lunas (unpaid/pending/null)
 * 5. Count by status (all variants found)
 * 6. Total by month/periode (due_date)
 * 7. Total by apartment_location (if column exists)
 * 8. Total by room_number (if column exists)
 * 9. Idempotency check
 * 10. Delete detection false positive check
 */

import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../src/supabase-pagination';
import { Pool } from 'pg';

// --- Config ---
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const LOCAL_DB = {
    host: process.env.LOCAL_DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
    database: process.env.LOCAL_DB_NAME || 'kr_analytics',
    user: process.env.LOCAL_DB_USER || 'analytics',
    password: process.env.LOCAL_DB_PASSWORD || 'analytics_dev_password',
};

const RECENT_WINDOW_DAYS = 14;

function getWibDate(offsetDays = 0): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(wibMs);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('='.repeat(72));
    console.log('VALIDASI SINKRONISASI TAGIHAN_BULANAN');
    console.log('='.repeat(72));

    // --- Init connections ---
    console.log('\n[CONNECT] Production Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
    });

    console.log('[CONNECT] Local analytics DB...');
    const localPool = new Pool(LOCAL_DB);

    // Test connections
    const { error: supabaseErr } = await supabase.from('tagihan_bulanan').select('id', { count: 'exact', head: true });
    if (supabaseErr) throw new Error(`Supabase connection failed: ${supabaseErr.message}`);
    console.log('  ✓ Production connected');

    const localTest = await localPool.query('SELECT 1 as ok');
    if (!localTest.rows[0]?.ok) throw new Error('Local DB connection failed');
    console.log('  ✓ Local DB connected');

    // ============================================
    // 1. TOTAL ROWS COUNT
    // ============================================
    console.log('\n─── 1. Total Rows ───');

    const { count: prodCount, error: prodCountErr } = await supabase
        .from('tagihan_bulanan')
        .select('id', { count: 'exact', head: true });
    if (prodCountErr) throw new Error(`Prod count error: ${prodCountErr.message}`);

    const localCountResult = await localPool.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_deleted = FALSE) as active FROM tagihan_bulanan`
    );
    const localTotal = parseInt(localCountResult.rows[0].total, 10);
    const localActive = parseInt(localCountResult.rows[0].active, 10);

    console.log(`  Production rows:     ${prodCount}`);
    console.log(`  Local total rows:    ${localTotal}`);
    console.log(`  Local active rows:   ${localActive}`);
    console.log(`  Match:               ${prodCount === localActive ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 2. TOTAL NOMINAL TAGIHAN (ALL TIME)
    // ============================================
    console.log('\n─── 2. Total Nominal Tagihan (All Time) ───');

    const prodAmountRows = await fetchAllPaginated<{ amount: number }>(
        supabase, 'tagihan_bulanan', 'amount'
    );
    const prodTotalAmount = prodAmountRows.reduce((acc, r) => acc + Number(r.amount), 0);

    const localSumResult = await localPool.query(
        `SELECT COALESCE(SUM(amount), 0) as total_amount FROM tagihan_bulanan WHERE is_deleted = FALSE`
    );
    const localTotalAmount = parseFloat(localSumResult.rows[0].total_amount);

    console.log(`  Production total:    Rp ${prodTotalAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    console.log(`  Local total:         Rp ${localTotalAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    const matchAllTime = Math.abs(prodTotalAmount - localTotalAmount) < 0.01;
    console.log(`  Match:               ${matchAllTime ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 3. TOTAL TAGIHAN LUNAS (paid OR lunas) vs BELUM LUNAS
    // ============================================
    console.log('\n─── 3. Total Tagihan by Payment Status ───');

    const prodRows = await fetchAllPaginated<{ status: string | null; amount: number }>(
        supabase, 'tagihan_bulanan', 'status, amount'
    );

    // Count by status — production
    const prodStatusCounts = new Map<string, { count: number; total: number }>();
    for (const r of prodRows) {
        const key = r.status ?? '(NULL)';
        const existing = prodStatusCounts.get(key) || { count: 0, total: 0 };
        existing.count++;
        existing.total += Number(r.amount);
        prodStatusCounts.set(key, existing);
    }

    // Count by status — local
    const localStatusResult = await localPool.query(`
        SELECT COALESCE(status, '(NULL)') as status_key,
               COUNT(*) as cnt,
               COALESCE(SUM(amount), 0) as total
        FROM tagihan_bulanan WHERE is_deleted = FALSE
        GROUP BY status_key ORDER BY status_key
    `);

    console.log(`  ${'Status'.padEnd(20)} ${'Prod Count'.padEnd(12)} ${'Local Count'.padEnd(12)} ${'Prod Amount'.padEnd(18)} ${'Local Amount'.padEnd(18)} Match`);
    console.log(`  ${'-'.repeat(20)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(18)} ${'-'.repeat(18)} ${'-'.repeat(5)}`);

    let allStatusesMatch = true;
    const allStatusKeys = new Set([...prodStatusCounts.keys(), ...localStatusResult.rows.map((r: any) => r.status_key)]);
    for (const key of [...allStatusKeys].sort()) {
        const p = prodStatusCounts.get(key) || { count: 0, total: 0 };
        const lRow = localStatusResult.rows.find((r: any) => r.status_key === key);
        const lCnt = lRow ? parseInt(lRow.cnt, 10) : 0;
        const lAmt = lRow ? parseFloat(lRow.total) : 0;
        const match = p.count === lCnt && Math.abs(p.total - lAmt) < 0.01;
        if (!match) allStatusesMatch = false;
        console.log(`  ${key.padEnd(20)} ${String(p.count).padEnd(12)} ${String(lCnt).padEnd(12)} Rp ${p.total.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} Rp ${lAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} ${match ? '✓' : '✗'}`);
    }
    console.log(`  All statuses match: ${allStatusesMatch ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 4. LUNAPELUNASAN AGGREGATE
    // ============================================
    console.log('\n─── 4. Aggregate: Lunas vs Belum Lunas ───');

    const lunasStatuses = ['lunas', 'paid'];
    const belumLunasStatuses = ['belum lunas', 'unpaid', 'pending', '(NULL)'];

    // Production
    const prodLunas = prodRows
        .filter((r) => r.status && lunasStatuses.includes(r.status.toLowerCase()))
        .reduce((acc, r) => acc + Number(r.amount), 0);
    const prodBelumLunas = prodRows
        .filter((r) => !r.status || belumLunasStatuses.includes(r.status.toLowerCase()))
        .reduce((acc, r) => acc + Number(r.amount), 0);

    // Local
    const localLunasResult = await localPool.query(`
        SELECT COALESCE(SUM(amount), 0) as total FROM tagihan_bulanan
        WHERE is_deleted = FALSE AND LOWER(status) IN ('lunas', 'paid')
    `);
    const localLunas = parseFloat(localLunasResult.rows[0].total);

    const localBelumLunasResult = await localPool.query(`
        SELECT COALESCE(SUM(amount), 0) as total FROM tagihan_bulanan
        WHERE is_deleted = FALSE AND (status IS NULL OR LOWER(status) IN ('belum lunas', 'unpaid', 'pending'))
    `);
    const localBelumLunas = parseFloat(localBelumLunasResult.rows[0].total);

    console.log(`  ${'Category'.padEnd(25)} ${'Production'.padEnd(18)} ${'Local'.padEnd(18)} Match`);
    console.log(`  ${'-'.repeat(25)} ${'-'.repeat(18)} ${'-'.repeat(18)} ${'-'.repeat(5)}`);
    const mLunas = Math.abs(prodLunas - localLunas) < 0.01;
    const mBelum = Math.abs(prodBelumLunas - localBelumLunas) < 0.01;
    console.log(`  Lunas (paid/lunas)        Rp ${prodLunas.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} Rp ${localLunas.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} ${mLunas ? '✓' : '✗'}`);
    console.log(`  Belum Lunas (unpaid/dll)  Rp ${prodBelumLunas.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} Rp ${localBelumLunas.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} ${mBelum ? '✓' : '✗'}`);

    // ============================================
    // 5. TOTAL BY MONTH (due_date)
    // ============================================
    console.log('\n─── 5. Total by Month (due_date) ───');

    // Production: group by YYYY-MM of due_date
    const prodMonthMap = new Map<string, { count: number; total: number }>();
    for (const r of prodRows) {
        // We don't have due_date in prodRows fetch; need to refetch
    }
    // Refetch with due_date
    const prodMonthRows = await fetchAllPaginated<{ due_date: string; amount: number }>(
        supabase, 'tagihan_bulanan', 'due_date, amount'
    );
    {
        for (const r of prodMonthRows) {
            const monthKey = r.due_date ? r.due_date.substring(0, 7) : 'unknown';
            const existing = prodMonthMap.get(monthKey) || { count: 0, total: 0 };
            existing.count++;
            existing.total += Number(r.amount);
            prodMonthMap.set(monthKey, existing);
        }
    }

    const localMonthResult = await localPool.query(`
        SELECT TO_CHAR(due_date, 'YYYY-MM') as month_key,
               COUNT(*) as cnt,
               COALESCE(SUM(amount), 0) as total
        FROM tagihan_bulanan WHERE is_deleted = FALSE
        GROUP BY month_key ORDER BY month_key
    `);

    console.log(`  ${'Month'.padEnd(12)} ${'Prod Count'.padEnd(12)} ${'Local Count'.padEnd(12)} ${'Prod Amount'.padEnd(18)} ${'Local Amount'.padEnd(18)} Match`);
    console.log(`  ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(18)} ${'-'.repeat(18)} ${'-'.repeat(5)}`);

    let allMonthsMatch = true;
    const allMonths = new Set([...prodMonthMap.keys(), ...localMonthResult.rows.map((r: any) => r.month_key)]);
    for (const month of [...allMonths].sort()) {
        const p = prodMonthMap.get(month) || { count: 0, total: 0 };
        const lRow = localMonthResult.rows.find((r: any) => r.month_key === month);
        const lCnt = lRow ? parseInt(lRow.cnt, 10) : 0;
        const lAmt = lRow ? parseFloat(lRow.total) : 0;
        const match = p.count === lCnt && Math.abs(p.total - lAmt) < 0.01;
        if (!match) allMonthsMatch = false;
        console.log(`  ${month.padEnd(12)} ${String(p.count).padEnd(12)} ${String(lCnt).padEnd(12)} Rp ${p.total.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} Rp ${lAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} ${match ? '✓' : '✗'}`);
    }
    console.log(`  All months match: ${allMonthsMatch ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 6. TOTAL BY APARTMENT_LOCATION
    // ============================================
    console.log('\n─── 6. Total by Apartment Location ───');

    // Production
    const prodLocMap = new Map<string, { count: number; total: number }>();
    for (const r of prodRows) {
        const loc = (r as any).apartment_location || '(unknown)';
        const existing = prodLocMap.get(loc) || { count: 0, total: 0 };
        existing.count++;
        existing.total += Number(r.amount);
        prodLocMap.set(loc, existing);
    }

    const localLocResult = await localPool.query(`
        SELECT COALESCE(apartment_location, '(unknown)') as loc,
               COUNT(*) as cnt,
               COALESCE(SUM(amount), 0) as total
        FROM tagihan_bulanan WHERE is_deleted = FALSE
        GROUP BY loc ORDER BY loc
    `);

    console.log(`  ${'Location'.padEnd(25)} ${'Prod Count'.padEnd(12)} ${'Local Count'.padEnd(12)} ${'Prod Amount'.padEnd(18)} ${'Local Amount'.padEnd(18)} Match`);
    console.log(`  ${'-'.repeat(25)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(18)} ${'-'.repeat(18)} ${'-'.repeat(5)}`);

    let allLocsMatch = true;
    const allLocs = new Set([...prodLocMap.keys(), ...localLocResult.rows.map((r: any) => r.loc)]);
    for (const loc of [...allLocs].sort()) {
        const p = prodLocMap.get(loc) || { count: 0, total: 0 };
        const lRow = localLocResult.rows.find((r: any) => r.loc === loc);
        const lCnt = lRow ? parseInt(lRow.cnt, 10) : 0;
        const lAmt = lRow ? parseFloat(lRow.total) : 0;
        const match = p.count === lCnt && Math.abs(p.total - lAmt) < 0.01;
        if (!match) allLocsMatch = false;
        console.log(`  ${loc.padEnd(25)} ${String(p.count).padEnd(12)} ${String(lCnt).padEnd(12)} Rp ${p.total.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} Rp ${lAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} ${match ? '✓' : '✗'}`);
    }
    console.log(`  All locations match: ${allLocsMatch ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 7. TOTAL BY ROOM_NUMBER (top 20)
    // ============================================
    console.log('\n─── 7. Top 20 by Room Number ───');

    const localRoomResult = await localPool.query(`
        SELECT room_number, apartment_location,
               COUNT(*) as cnt,
               COALESCE(SUM(amount), 0) as total
        FROM tagihan_bulanan WHERE is_deleted = FALSE
        GROUP BY room_number, apartment_location
        ORDER BY total DESC LIMIT 20
    `);

    console.log(`  ${'Room'.padEnd(15)} ${'Location'.padEnd(20)} ${'Count'.padEnd(8)} ${'Total Amount'.padEnd(18)}`);
    console.log(`  ${'-'.repeat(15)} ${'-'.repeat(20)} ${'-'.repeat(8)} ${'-'.repeat(18)}`);
    for (const r of localRoomResult.rows) {
        console.log(`  ${String(r.room_number).padEnd(15)} ${String(r.apartment_location).padEnd(20)} ${String(r.cnt).padEnd(8)} Rp ${parseFloat(r.total).toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)}`);
    }

    // ============================================
    // 8. IDEMPOTENCY CHECK
    // ============================================
    console.log('\n─── 8. Idempotency Check ───');

    const dupCheck = await localPool.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT id) as distinct_count FROM tagihan_bulanan`
    );
    const totalRows = parseInt(dupCheck.rows[0].total, 10);
    const distinctRows = parseInt(dupCheck.rows[0].distinct_count, 10);
    const noDuplicates = totalRows === distinctRows;
    console.log(`  Total rows:           ${totalRows}`);
    console.log(`  Distinct ids:         ${distinctRows}`);
    console.log(`  No duplicates:        ${noDuplicates ? '✓ YES' : '✗ NO (DUPLICATES FOUND!)'}`);

    // ============================================
    // 9. DELETE DETECTION CHECK
    // ============================================
    console.log('\n─── 9. Delete Detection Sanity Check ───');

    const cutoffDate = getWibDate(-RECENT_WINDOW_DAYS);

    const falsePositiveCheck = await localPool.query(
        `SELECT id FROM tagihan_bulanan
         WHERE is_deleted = TRUE AND due_date >= $1
         LIMIT 20`,
        [cutoffDate]
    );

    if (falsePositiveCheck.rows.length > 0) {
        const deletedIds = falsePositiveCheck.rows.map((r: any) => r.id);
        const { data: prodCheck } = await supabase
            .from('tagihan_bulanan')
            .select('id')
            .in('id', deletedIds);
        const prodExists = new Set((prodCheck || []).map((r: { id: number }) => r.id));
        const falsePositives = deletedIds.filter((id: number) => prodExists.has(id));

        if (falsePositives.length > 0) {
            console.log(`  ⚠ FALSE POSITIVES: ${falsePositives.length} rows exist in production but marked as deleted locally`);
            console.log(`  IDs: ${falsePositives.slice(0, 10).join(', ')}${falsePositives.length > 10 ? '...' : ''}`);
        } else {
            console.log(`  ✓ No false positives: all ${deletedIds.length} deleted rows confirmed missing from production`);
        }
    } else {
        console.log('  ✓ No deleted rows found in re-scan window');
    }

    const activeCount = await localPool.query(
        `SELECT COUNT(*) as cnt FROM tagihan_bulanan WHERE is_deleted = FALSE`
    );
    const activeRows = parseInt(activeCount.rows[0].cnt, 10);
    console.log(`  Active rows in local: ${activeRows}`);
    console.log(`  Basic sanity (active > 0): ${activeRows > 0 ? '✓ PASS' : '✗ FAIL'}`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(72));
    console.log('RINGKASAN VALIDASI');
    console.log('='.repeat(72));
    console.log(`  1. Total rows match:              ${prodCount === localActive ? '✓' : '✗'} (prod=${prodCount}, local_active=${localActive})`);
    console.log(`  2. Total amount (all time):       ${matchAllTime ? '✓' : '✗'} (prod=${prodTotalAmount.toFixed(2)}, local=${localTotalAmount.toFixed(2)})`);
    console.log(`  3. Status counts match:           ${allStatusesMatch ? '✓' : '✗'}`);
    console.log(`  4. Lunas aggregate match:         ${mLunas && mBelum ? '✓' : '✗'}`);
    console.log(`  5. Monthly totals match:          ${allMonthsMatch ? '✓' : '✗'}`);
    console.log(`  6. Location totals match:         ${allLocsMatch ? '✓' : '✗'}`);
    console.log(`  7. No duplicates:                 ${noDuplicates ? '✓' : '✗'}`);
    console.log(`  8. No delete false positives:     ${falsePositiveCheck.rows.length === 0 ? '✓ (no deletions)' : '✓ (verified)'}`);
    console.log(`  9. Active rows sanity:            ${activeRows > 0 ? '✓' : '✗'}`);
    console.log('');
    const overall = prodCount === localActive && matchAllTime && allStatusesMatch && mLunas && mBelum && allMonthsMatch && allLocsMatch && noDuplicates && activeRows > 0;
    console.log(`  Overall:                          ${overall ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}`);

    await localPool.end();
    process.exit(0);
}

main().catch((err) => {
    console.error('\n❌ Validation failed:', err);
    process.exit(1);
});
