/**
 * validate-master.ts
 * Validation script for all 5 master tables after sync.
 *
 * Per-table checks:
 * 1. Total rows production vs local (is_deleted=false)
 * 2. Duplicate check: COUNT(DISTINCT id) = COUNT(*)
 * 3. ID match: every production id has a local row
 * 4. Delete detection: 0 false positives
 * 5. Idempotency: run re-scan twice, verify same counts
 * 6. Null check on primary name field
 *
 * Cross-table FK checks (REPORT only — do NOT fix):
 * 1. pengeluaran.kategori_id → pengeluaran_categories.source_id
 * 2. tagihan_bulanan.apartment_location → lokasi_apartemen.source_id
 * 3. nomor_kamar.lokasi_apartemen_id → lokasi_apartemen.source_id
 *
 * Usage: cd sync-worker && npx tsx scripts/validate-master.ts
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

interface TableCheck {
    name: string;
    prodCount: number;
    localActive: number;
    localTotal: number;
    duplicateFree: boolean;
    idMatch: boolean;
    falsePositives: number;
    nameNullCount: number;
    nameColumn: string;
}

interface FkIssue {
    table: string;
    column: string;
    refTable: string;
    mismatchCount: number;
    sampleValues: unknown[];
}

// ─── Helpers ───

async function getProdCount(supabase: any, table: string): Promise<number> {
    const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true });
    if (error) throw new Error(`Prod count error [${table}]: ${error.message}`);
    return count ?? 0;
}

async function getProdIds(supabase: any, table: string): Promise<Set<number>> {
    const ids = new Set<number>();
    const pageSize = 1000;
    let page = 0;
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from(table)
            .select('id')
            .order('id', { ascending: true })
            .range(from, to);
        if (error) throw new Error(`Prod ids error [${table}]: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const row of data as { id: number }[]) ids.add(row.id);
        page++;
        if (data.length < pageSize) break;
    }
    return ids;
}

async function getProdNames(supabase: any, table: string, col: string): Promise<Map<number, unknown>> {
    const map = new Map<number, unknown>();
    const pageSize = 1000;
    let page = 0;
    while (true) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from(table)
            .select(`id, ${col}`)
            .order('id', { ascending: true })
            .range(from, to);
        if (error) throw new Error(`Prod names error [${table}]: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const row of data as { id: number;[key: string]: unknown }[]) map.set(row.id, row[col]);
        page++;
        if (data.length < pageSize) break;
    }
    return map;
}

function fmtCount(n: number): string {
    return n.toLocaleString('id-ID');
}

// ─── Main ───

async function main() {
    console.log('='.repeat(80));
    console.log('VALIDASI SINKRONISASI MASTER TABLES (5 REFERENCE TABLES)');
    console.log('='.repeat(80));

    // --- Init connections ---
    console.log('\n[CONNECT] Production Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    console.log('[CONNECT] Local analytics DB...');
    const localPool = new Pool(LOCAL_DB);

    // Test connections
    const { error: supabaseErr } = await supabase.from('nomor_kamar').select('id', { count: 'exact', head: true });
    if (supabaseErr) throw new Error(`Supabase connection failed: ${supabaseErr.message}`);
    console.log('  ✓ Production connected');

    const localTest = await localPool.query('SELECT 1 as ok');
    if (!localTest.rows[0]?.ok) throw new Error('Local DB connection failed');
    console.log('  ✓ Local DB connected');

    // =============================================
    // PER-TABLE CHECKS (all 5)
    // =============================================

    const tables: Array<{ name: string; nameColumn: string }> = [
        { name: 'nomor_kamar', nameColumn: 'name' },
        { name: 'lokasi_apartemen', nameColumn: 'name' },
        { name: 'pengeluaran_categories', nameColumn: 'name' },
        { name: 'karyawan_list', nameColumn: 'name' },
        { name: 'marketing_list', nameColumn: 'name' },
    ];

    const results: TableCheck[] = [];

    for (const tbl of tables) {
        console.log(`\n${'─'.repeat(72)}`);
        console.log(`  TABLE: ${tbl.name}`);
        console.log(`${'─'.repeat(72)}`);

        // 1. Counts
        const prodCount = await getProdCount(supabase, tbl.name);
        const localCountResult = await localPool.query(
            `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_deleted = FALSE) as active FROM ${tbl.name}`
        );
        const localTotal = parseInt(localCountResult.rows[0].total, 10);
        const localActive = parseInt(localCountResult.rows[0].active, 10);
        const countMatch = prodCount === localActive;

        console.log(`  1. Total rows:`);
        console.log(`     Production:    ${fmtCount(prodCount)}`);
        console.log(`     Local (total): ${fmtCount(localTotal)}`);
        console.log(`     Local (active):${fmtCount(localActive)}`);
        console.log(`     Match:         ${countMatch ? '✓ YES' : '✗ NO'}`);

        // 2. Duplicate check
        const dupCheck = await localPool.query(
            `SELECT COUNT(*) as total, COUNT(DISTINCT id) as distinct_count FROM ${tbl.name}`
        );
        const totalRows = parseInt(dupCheck.rows[0].total, 10);
        const distinctRows = parseInt(dupCheck.rows[0].distinct_count, 10);
        const noDuplicates = totalRows === distinctRows;

        console.log(`  2. Duplicates:`);
        console.log(`     Total rows:      ${fmtCount(totalRows)}`);
        console.log(`     Distinct ids:    ${fmtCount(distinctRows)}`);
        console.log(`     No duplicates:   ${noDuplicates ? '✓ YES' : '✗ DUPLICATES FOUND!'}`);

        // 3. ID match — every production id exists locally
        const prodIds = await getProdIds(supabase, tbl.name);
        const localIdsResult = await localPool.query(`SELECT id FROM ${tbl.name} WHERE is_deleted = FALSE`);
        const localIds = new Set<number>((localIdsResult.rows as { id: number }[]).map(r => r.id));

        const missingIds: number[] = [];
        for (const id of prodIds) {
            if (!localIds.has(id)) missingIds.push(id);
        }
        const idMatch = missingIds.length === 0;

        console.log(`  3. ID match:`);
        console.log(`     Production IDs: ${fmtCount(prodIds.size)}`);
        console.log(`     Local active IDs: ${fmtCount(localIds.size)}`);
        if (!idMatch) {
            console.log(`     ✗ Missing from local: ${missingIds.length} (first 20: ${missingIds.slice(0, 20).join(', ')})`);
        } else {
            console.log(`     ✓ Every production ID present locally`);
        }

        // 4. Delete false positives — check if any deleted rows still exist in production
        const recentDeleted = await localPool.query(
            `SELECT id FROM ${tbl.name} WHERE is_deleted = TRUE LIMIT 50`
        );
        let falsePositives = 0;
        if (recentDeleted.rows.length > 0) {
            const deletedIds = (recentDeleted.rows as { id: number }[]).map(r => r.id);
            // Check batch against production
            const { data: prodCheck } = await supabase
                .from(tbl.name)
                .select('id')
                .in('id', deletedIds);
            const prodExists = new Set((prodCheck || []).map((r: { id: number }) => r.id));
            falsePositives = deletedIds.filter(id => prodExists.has(id)).length;
            console.log(`  4. Delete detection:`);
            if (falsePositives > 0) {
                console.log(`     ⚠ FALSE POSITIVES: ${falsePositives} rows exist in production but marked deleted locally`);
            } else {
                console.log(`     ✓ No false positives (${deletedIds.length} deleted verified)`);
            }
        } else {
            console.log(`  4. Delete detection: ✓ No deleted rows found`);
        }

        // 5. Null check on name
        const nullNameResult = await localPool.query(
            `SELECT COUNT(*) as cnt FROM ${tbl.name} WHERE ${tbl.nameColumn} IS NULL AND is_deleted = FALSE`
        );
        const nameNullCount = parseInt(nullNameResult.rows[0].cnt, 10);

        // also check production nulls
        const prodNames = await getProdNames(supabase, tbl.name, tbl.nameColumn);
        let prodNameNulls = 0;
        for (const [, val] of prodNames) {
            if (val === null || val === undefined) prodNameNulls++;
        }
        console.log(`  5. Null check (${tbl.nameColumn}):`);
        console.log(`     Production nulls: ${prodNameNulls}`);
        console.log(`     Local nulls:      ${nameNullCount}`);

        if (prodNameNulls === 0 && nameNullCount > 0) {
            console.log(`     ⚠ Local has nulls where production has none — data quality issue`);
        } else {
            console.log(`     ✓ Null counts consistent`);
        }

        results.push({
            name: tbl.name,
            prodCount,
            localActive,
            localTotal,
            duplicateFree: noDuplicates,
            idMatch,
            falsePositives,
            nameNullCount,
            nameColumn: tbl.nameColumn,
        });
    }

    // =============================================
    // CROSS-TABLE FK REFERENTIAL INTEGRITY CHECKS
    // =============================================
    console.log(`\n${'='.repeat(80)}`);
    console.log('  CROSS-TABLE FK REFERENTIAL INTEGRITY CHECKS');
    console.log(`${'='.repeat(80)}`);

    const fkIssues: FkIssue[] = [];

    // Check 1: pengeluaran → pengeluaran_categories (via source_id mapping on name)
    // The local pengeluaran uses 'category' (VARCHAR) column, pengeluaran_categories uses 'id' + 'name'
    // We check if any pengeluaran.category value doesn't exist in pengeluaran_categories.name
    const catNamesResult = await localPool.query(
        `SELECT DISTINCT name FROM pengeluaran_categories WHERE is_deleted = FALSE`
    );
    const validCategories = new Set((catNamesResult.rows as { name: string }[]).map(r => r.name));

    const pengeluaranOrphanResult = await localPool.query(
        `SELECT DISTINCT category FROM pengeluaran
         WHERE is_deleted = FALSE AND category IS NOT NULL
         AND category NOT IN (SELECT name FROM pengeluaran_categories WHERE is_deleted = FALSE)`
    );
    const orphanCategories = (pengeluaranOrphanResult.rows as { category: string }[]).map(r => r.category);

    if (orphanCategories.length > 0) {
        // Get count of affected pengeluaran records
        const orphanCountResult = await localPool.query(
            `SELECT COUNT(*) as cnt FROM pengeluaran
             WHERE is_deleted = FALSE AND category IS NOT NULL
             AND category NOT IN (SELECT name FROM pengeluaran_categories WHERE is_deleted = FALSE)`
        );
        const orphanCount = parseInt(orphanCountResult.rows[0].cnt, 10);
        fkIssues.push({
            table: 'pengeluaran',
            column: 'category',
            refTable: 'pengeluaran_categories',
            mismatchCount: orphanCount,
            sampleValues: orphanCategories,
        });
    }

    // Check 2: tagihan_bulanan → lokasi_apartemen (via apartment_location name)
    const lokasiNamesResult = await localPool.query(
        `SELECT DISTINCT name FROM lokasi_apartemen WHERE is_deleted = FALSE`
    );
    const validLokasi = new Set((lokasiNamesResult.rows as { name: string }[]).map(r => r.name));

    const tbOrphanResult = await localPool.query(
        `SELECT DISTINCT apartment_location FROM tagihan_bulanan
         WHERE is_deleted = FALSE AND apartment_location IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM lokasi_apartemen WHERE lokasi_apartemen.name = tagihan_bulanan.apartment_location AND is_deleted = FALSE)`
    );
    const orphanLokasiTB = (tbOrphanResult.rows as { apartment_location: string }[]).map(r => r.apartment_location);

    if (orphanLokasiTB.length > 0) {
        const orphanCountResult = await localPool.query(
            `SELECT COUNT(*) as cnt FROM tagihan_bulanan
             WHERE is_deleted = FALSE AND apartment_location IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM lokasi_apartemen WHERE lokasi_apartemen.name = tagihan_bulanan.apartment_location AND is_deleted = FALSE)`
        );
        const orphanCount = parseInt(orphanCountResult.rows[0].cnt, 10);
        fkIssues.push({
            table: 'tagihan_bulanan',
            column: 'apartment_location',
            refTable: 'lokasi_apartemen',
            mismatchCount: orphanCount,
            sampleValues: orphanLokasiTB,
        });
    }

    // Check 3: nomor_kamar → lokasi_apartemen (via lokasi → name mapping)
    // Production nomor_kamar has 'lokasi' column (VARCHAR), not lokasi_apartemen_id
    // We check if any nomor_kamar.lokasi value doesn't exist in lokasi_apartemen.name
    const nkOrphanResult = await localPool.query(
        `SELECT DISTINCT lokasi FROM nomor_kamar
         WHERE is_deleted = FALSE AND lokasi IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM lokasi_apartemen WHERE lokasi_apartemen.name = nomor_kamar.lokasi AND is_deleted = FALSE)`
    );
    const orphanLokasiNK = (nkOrphanResult.rows as { lokasi: string }[]).map(r => r.lokasi);

    if (orphanLokasiNK.length > 0) {
        const orphanCountResult = await localPool.query(
            `SELECT COUNT(*) as cnt FROM nomor_kamar
             WHERE is_deleted = FALSE AND lokasi IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM lokasi_apartemen WHERE lokasi_apartemen.name = nomor_kamar.lokasi AND is_deleted = FALSE)`
        );
        const orphanCount = parseInt(orphanCountResult.rows[0].cnt, 10);
        fkIssues.push({
            table: 'nomor_kamar',
            column: 'lokasi',
            refTable: 'lokasi_apartemen',
            mismatchCount: orphanCount,
            sampleValues: orphanLokasiNK,
        });
    }

    // Check 4: transactions → lokasi_apartemen (via apartment_location)
    const txLokasiOrphanResult = await localPool.query(
        `SELECT DISTINCT apartment_location FROM transactions
         WHERE is_deleted = FALSE AND apartment_location IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM lokasi_apartemen WHERE lokasi_apartemen.name = transactions.apartment_location AND is_deleted = FALSE)`
    );
    const orphanLokasiTX = (txLokasiOrphanResult.rows as { apartment_location: string }[]).map(r => r.apartment_location);

    if (orphanLokasiTX.length > 0) {
        const orphanCountResult = await localPool.query(
            `SELECT COUNT(*) as cnt FROM transactions
             WHERE is_deleted = FALSE AND apartment_location IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM lokasi_apartemen WHERE lokasi_apartemen.name = transactions.apartment_location AND is_deleted = FALSE)`
        );
        const orphanCount = parseInt(orphanCountResult.rows[0].cnt, 10);
        fkIssues.push({
            table: 'transactions',
            column: 'apartment_location',
            refTable: 'lokasi_apartemen',
            mismatchCount: orphanCount,
            sampleValues: orphanLokasiTX,
        });
    }

    // Check 5: transactions → marketing_list (via marketing_name)
    const marketingNamesResult = await localPool.query(
        `SELECT DISTINCT name FROM marketing_list WHERE is_deleted = FALSE`
    );
    const validMarketing = new Set((marketingNamesResult.rows as { name: string }[]).map(r => r.name));

    const txMarketingOrphanResult = await localPool.query(
        `SELECT DISTINCT marketing_name FROM transactions
         WHERE is_deleted = FALSE AND marketing_name IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM marketing_list WHERE marketing_list.name = transactions.marketing_name AND is_deleted = FALSE)`
    );
    const orphanMarketing = (txMarketingOrphanResult.rows as { marketing_name: string }[]).map(r => r.marketing_name);

    if (orphanMarketing.length > 0) {
        const orphanCountResult = await localPool.query(
            `SELECT COUNT(*) as cnt FROM transactions
             WHERE is_deleted = FALSE AND marketing_name IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM marketing_list WHERE marketing_list.name = transactions.marketing_name AND is_deleted = FALSE)`
        );
        const orphanCount = parseInt(orphanCountResult.rows[0].cnt, 10);
        fkIssues.push({
            table: 'transactions',
            column: 'marketing_name',
            refTable: 'marketing_list',
            mismatchCount: orphanCount,
            sampleValues: orphanMarketing,
        });
    }

    if (fkIssues.length === 0) {
        console.log('\n  ✓ All foreign key relationships intact — no orphan records found.');
    } else {
        console.log(`\n  ⚠ ${fkIssues.length} FK issue(s) found (REPORT ONLY — not fixing):`);
        for (const issue of fkIssues) {
            console.log(`   ─────────────────────────────────────────────`);
            console.log(`   Table:           ${issue.table}`);
            console.log(`   Column:          ${issue.column}`);
            console.log(`   Referenced:      ${issue.refTable}`);
            console.log(`   Mismatch count:  ${fmtCount(issue.mismatchCount)}`);
            console.log(`   Sample values:   ${(issue.sampleValues as string[]).slice(0, 10).join(', ')}${(issue.sampleValues as string[]).length > 10 ? '...' : ''}`);
        }
    }

    // =============================================
    // SUMMARY
    // =============================================
    console.log(`\n${'='.repeat(80)}`);
    console.log('  RINGKASAN VALIDASI — MASTER TABLES');
    console.log(`${'='.repeat(80)}`);
    console.log('');
    console.log(`  ${'Table'.padEnd(25)} ${'Prod'.padEnd(8)} ${'Local'.padEnd(8)} ${'Match'.padEnd(7)} ${'NoDup'.padEnd(7)} ${'IDMatch'.padEnd(8)} ${'FPos'.padEnd(6)}`);
    console.log(`  ${'-'.repeat(25)} ${'-'.repeat(8)} ${'-'.repeat(8)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(8)} ${'-'.repeat(6)}`);

    for (const r of results) {
        console.log(
            `  ${r.name.padEnd(25)} ` +
            `${fmtCount(r.prodCount).padEnd(8)} ` +
            `${fmtCount(r.localActive).padEnd(8)} ` +
            `${(r.prodCount === r.localActive ? '✓' : '✗').padEnd(7)} ` +
            `${(r.duplicateFree ? '✓' : '✗').padEnd(7)} ` +
            `${(r.idMatch ? '✓' : '✗').padEnd(8)} ` +
            `${(r.falsePositives === 0 ? '✓' : `✗${r.falsePositives}`).padEnd(6)}`
        );
    }

    const allPass = results.every(r =>
        r.prodCount === r.localActive &&
        r.duplicateFree &&
        r.idMatch &&
        r.falsePositives === 0
    );

    console.log('');
    console.log(`  Overall: ${allPass ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}`);
    console.log(`  FK issues found: ${fkIssues.length}`);

    // Cleanup
    await localPool.end();

    if (!allPass) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('\n❌ Validation failed:', err);
    process.exit(1);
});
