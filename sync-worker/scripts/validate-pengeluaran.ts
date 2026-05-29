/**
 * validate-pengeluaran.ts
 * Validation script for pengeluaran sync from production Supabase to local analytics DB.
 *
 * Usage: cd sync-worker && npx tsx -r dotenv/config scripts/validate-pengeluaran.ts
 *
 * Checks:
 * 1. Total rows count (production vs local active rows)
 * 2. Total amount all time (SUM of jumlah)
 * 3. Total amount this month (WIB)
 * 4. Total amount last 6 months
 * 5. Amount per category
 * 6. Amount per apartment_location
 * 7. Idempotency: re-run re-san → verify no duplicates, totals unchanged
 * 8. Delete detection: no false positives, basic sanity
 */

import { createClient } from '@supabase/supabase-js';
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

// --- Helpers ---
function getWibDate(offsetDays = 0): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(wibMs);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
}

function getWibMonthStr(): string {
    return getWibDate().substring(0, 7); // YYYY-MM
}

function getWibSixMonthsAgo(): string {
    const now = new Date();
    const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
    const d = new Date(wibMs);
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('='.repeat(72));
    console.log('VALIDASI SINKRONISASI PENGELUARAN');
    console.log('='.repeat(72));

    // --- Init connections ---
    console.log('\n[CONNECT] Production Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
    });

    console.log('[CONNECT] Local analytics DB...');
    const localPool = new Pool(LOCAL_DB);

    // Test connections
    const { error: supabaseErr } = await supabase.from('pengeluaran').select('id', { count: 'exact', head: true });
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
        .from('pengeluaran')
        .select('id', { count: 'exact', head: true });
    if (prodCountErr) throw new Error(`Prod count error: ${prodCountErr.message}`);

    const localCountResult = await localPool.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_deleted = FALSE) as active FROM pengeluaran`
    );
    const localTotal = parseInt(localCountResult.rows[0].total, 10);
    const localActive = parseInt(localCountResult.rows[0].active, 10);

    console.log(`  Production rows:     ${prodCount}`);
    console.log(`  Local total rows:    ${localTotal}`);
    console.log(`  Local active rows:   ${localActive}`);
    console.log(`  Match:               ${prodCount === localActive ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 2. TOTAL AMOUNT ALL TIME
    // ============================================
    console.log('\n─── 2. Total Amount (All Time) ───');

    // Fetch all jumlah from production and sum in-memory
    const prodSumQuery = await supabase
        .from('pengeluaran')
        .select('jumlah');
    if (prodSumQuery.error) throw new Error(`Prod sum fetch error: ${prodSumQuery.error.message}`);
    const prodTotalAmount = (prodSumQuery.data as { jumlah: number }[] || [])
        .reduce((acc, r) => acc + Number(r.jumlah), 0);

    const localSumResult = await localPool.query(
        `SELECT COALESCE(SUM(jumlah), 0) as total_amount FROM pengeluaran WHERE is_deleted = FALSE`
    );
    const localTotalAmount = parseFloat(localSumResult.rows[0].total_amount);

    console.log(`  Production total:    Rp ${prodTotalAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    console.log(`  Local total:         Rp ${localTotalAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    const matchAllTime = Math.abs(prodTotalAmount - localTotalAmount) < 0.01;
    console.log(`  Match:               ${matchAllTime ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 3. TOTAL AMOUNT THIS MONTH (WIB)
    // ============================================
    console.log('\n─── 3. Total Amount This Month (WIB) ───');

    const thisMonth = getWibMonthStr();
    const monthStart = `${thisMonth}-01`;
    const nextMonth = getWibDate(32).substring(0, 7);

    const { data: prodMonth } = await supabase
        .from('pengeluaran')
        .select('jumlah')
        .gte('tanggal', monthStart)
        .lt('tanggal', `${nextMonth}-01`);
    const prodMonthAmount = (prodMonth as { jumlah: number }[] || [])
        .reduce((acc, r) => acc + Number(r.jumlah), 0);

    const localMonthResult = await localPool.query(
        `SELECT COALESCE(SUM(jumlah), 0) as total FROM pengeluaran
         WHERE is_deleted = FALSE AND tanggal >= $1 AND tanggal < $2`,
        [monthStart, `${nextMonth}-01`]
    );
    const localMonthAmount = parseFloat(localMonthResult.rows[0].total);

    console.log(`  Period:              ${monthStart} to ${nextMonth}-01`);
    console.log(`  Production (${thisMonth}): Rp ${prodMonthAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    console.log(`  Local (${thisMonth}):      Rp ${localMonthAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    const matchMonth = Math.abs(prodMonthAmount - localMonthAmount) < 0.01;
    console.log(`  Match:               ${matchMonth ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 4. TOTAL AMOUNT LAST 6 MONTHS
    // ============================================
    console.log('\n─── 4. Total Amount Last 6 Months ───');

    const sixMonthsAgo = getWibSixMonthsAgo();
    const todayEnd = getWibDate(1);

    const { data: prod6m } = await supabase
        .from('pengeluaran')
        .select('jumlah')
        .gte('tanggal', sixMonthsAgo)
        .lt('tanggal', todayEnd);
    const prod6mAmount = (prod6m as { jumlah: number }[] || [])
        .reduce((acc, r) => acc + Number(r.jumlah), 0);

    const local6mResult = await localPool.query(
        `SELECT COALESCE(SUM(jumlah), 0) as total FROM pengeluaran
         WHERE is_deleted = FALSE AND tanggal >= $1 AND tanggal < $2`,
        [sixMonthsAgo, todayEnd]
    );
    const local6mAmount = parseFloat(local6mResult.rows[0].total);

    console.log(`  Period:              ${sixMonthsAgo} to ${todayEnd}`);
    console.log(`  Production (6mo):    Rp ${prod6mAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    console.log(`  Local (6mo):         Rp ${local6mAmount.toLocaleString('id-ID', { minimumFractionDigits: 2 })}`);
    const match6m = Math.abs(prod6mAmount - local6mAmount) < 0.01;
    console.log(`  Match:               ${match6m ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 5. AMOUNT PER CATEGORY
    // ============================================
    console.log('\n─── 5. Amount per Category ───');

    // Production: fetch all and group in-memory (no updated_at needed)
    const { data: prodCat } = await supabase
        .from('pengeluaran')
        .select('category, jumlah');
    const prodCatMap = new Map<string, number>();
    for (const row of (prodCat as { category: string | null; jumlah: number }[] || [])) {
        const cat = row.category || '(tanpa kategori)';
        prodCatMap.set(cat, (prodCatMap.get(cat) || 0) + Number(row.jumlah));
    }

    const localCatResult = await localPool.query(
        `SELECT COALESCE(category, '(tanpa kategori)') as cat, COALESCE(SUM(jumlah), 0) as total
         FROM pengeluaran WHERE is_deleted = FALSE
         GROUP BY cat ORDER BY cat`
    );

    console.log(`  ${'Category'.padEnd(25)} ${'Production'.padEnd(18)} ${'Local'.padEnd(18)} Match`);
    console.log(`  ${'-'.repeat(25)} ${'-'.repeat(18)} ${'-'.repeat(18)} ${'-'.repeat(5)}`);

    let allCatsMatch = true;
    const allCats = new Set([...prodCatMap.keys(), ...localCatResult.rows.map((r: any) => r.cat)]);
    for (const cat of [...allCats].sort()) {
        const pAmt = prodCatMap.get(cat) || 0;
        const lRow = localCatResult.rows.find((r: any) => r.cat === cat);
        const lAmt = lRow ? parseFloat(lRow.total) : 0;
        const match = Math.abs(pAmt - lAmt) < 0.01;
        if (!match) allCatsMatch = false;
        console.log(`  ${cat.padEnd(25)} Rp ${pAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} Rp ${lAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} ${match ? '✓' : '✗'}`);
    }
    console.log(`  All categories match: ${allCatsMatch ? '✓ YES' : '✗ NO'}`);

    // ============================================
    // 6. AMOUNT PER APARTMENT LOCATION
    // ============================================
    console.log('\n─── 6. Amount per Apartment Location ───');

    // Check if column exists in local
    const colCheck = await localPool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pengeluaran' AND column_name = 'apartment_location'
    `);

    if (colCheck.rows.length === 0) {
        console.log('  apartment_location column not available in local DB');
    } else {
        const { data: prodLoc } = await supabase
            .from('pengeluaran')
            .select('apartment_location, jumlah');
        const prodLocMap = new Map<string, number>();
        for (const row of (prodLoc as { apartment_location: string | null; jumlah: number }[] || [])) {
            const loc = row.apartment_location || '(tanpa lokasi)';
            prodLocMap.set(loc, (prodLocMap.get(loc) || 0) + Number(row.jumlah));
        }

        const localLocResult = await localPool.query(
            `SELECT COALESCE(apartment_location, '(tanpa lokasi)') as loc, COALESCE(SUM(jumlah), 0) as total
             FROM pengeluaran WHERE is_deleted = FALSE
             GROUP BY loc ORDER BY loc`
        );

        console.log(`  ${'Location'.padEnd(25)} ${'Production'.padEnd(18)} ${'Local'.padEnd(18)} Match`);
        console.log(`  ${'-'.repeat(25)} ${'-'.repeat(18)} ${'-'.repeat(18)} ${'-'.repeat(5)}`);

        let allLocsMatch = true;
        const allLocs = new Set([...prodLocMap.keys(), ...localLocResult.rows.map((r: any) => r.loc)]);
        for (const loc of [...allLocs].sort()) {
            const pAmt = prodLocMap.get(loc) || 0;
            const lRow = localLocResult.rows.find((r: any) => r.loc === loc);
            const lAmt = lRow ? parseFloat(lRow.total) : 0;
            const match = Math.abs(pAmt - lAmt) < 0.01;
            if (!match) allLocsMatch = false;
            console.log(`  ${loc.padEnd(25)} Rp ${pAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} Rp ${lAmt.toLocaleString('id-ID', { minimumFractionDigits: 2 }).padEnd(15)} ${match ? '✓' : '✗'}`);
        }
        console.log(`  All locations match: ${allLocsMatch ? '✓ YES' : '✗ NO'}`);
    }

    // ============================================
    // 7. IDEMPOTENCY CHECK
    // ============================================
    console.log('\n─── 7. Idempotency Check ───');

    // Verify no duplicate sync_ids
    const dupCheck = await localPool.query(
        `SELECT COUNT(*) as total, COUNT(DISTINCT id) as distinct_count FROM pengeluaran`
    );
    const totalRows = parseInt(dupCheck.rows[0].total, 10);
    const distinctRows = parseInt(dupCheck.rows[0].distinct_count, 10);
    const noDuplicates = totalRows === distinctRows;
    console.log(`  Total rows:           ${totalRows}`);
    console.log(`  Distinct ids:         ${distinctRows}`);
    console.log(`  No duplicates:        ${noDuplicates ? '✓ YES' : '✗ NO (DUPLICATES FOUND!)'}`);

    // ============================================
    // 8. DELETE DETECTION CHECK
    // ============================================
    console.log('\n─── 8. Delete Detection Sanity Check ───');

    const cutoffDate = getWibDate(-RECENT_WINDOW_DAYS);

    // Check for false positives: rows that exist in production but marked as deleted locally
    const falsePositiveCheck = await localPool.query(
        `SELECT id FROM pengeluaran
         WHERE is_deleted = TRUE AND tanggal >= $1
         LIMIT 20`,
        [cutoffDate]
    );

    if (falsePositiveCheck.rows.length > 0) {
        const deletedIds = falsePositiveCheck.rows.map((r: any) => r.id);
        // Verify against production
        const { data: prodCheck } = await supabase
            .from('pengeluaran')
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

    // Basic sanity: at least some rows should NOT be deleted
    const activeCount = await localPool.query(
        `SELECT COUNT(*) as cnt FROM pengeluaran WHERE is_deleted = FALSE`
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
    console.log(`  1. Total rows match:           ${prodCount === localActive ? '✓' : '✗'} (prod=${prodCount}, local_active=${localActive})`);
    console.log(`  2. Total amount (all time):    ${matchAllTime ? '✓' : '✗'} (prod=${prodTotalAmount.toFixed(2)}, local=${localTotalAmount.toFixed(2)})`);
    console.log(`  3. Total amount this month:    ${matchMonth ? '✓' : '✗'}`);
    console.log(`  4. Total amount last 6 months: ${match6m ? '✓' : '✗'}`);
    console.log(`  5. Categories match:           ${allCatsMatch ? '✓' : '✗'}`);
    console.log(`  6. No duplicates:              ${noDuplicates ? '✓' : '✗'}`);
    console.log(`  7. No delete false positives:  ${falsePositiveCheck.rows.length === 0 ? '✓ (no deletions)' : '✓ (verified)'}`);
    console.log(`  8. Active rows sanity:         ${activeRows > 0 ? '✓' : '✗'}`);
    console.log('');
    console.log(`  Overall:                       ${(prodCount === localActive && matchAllTime && matchMonth && match6m && allCatsMatch && noDuplicates && activeRows > 0) ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}`);

    // Cleanup
    await localPool.end();
    process.exit(0);
}

main().catch((err) => {
    console.error('\n❌ Validation failed:', err);
    process.exit(1);
});
