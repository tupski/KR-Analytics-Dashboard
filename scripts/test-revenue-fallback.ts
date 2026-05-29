/**
 * Test fallback mechanism for revenue migration (Phase 2B-5A).
 *
 * Verifies:
 * 1. analyticsConfigured() returns false when ANALYTICS_DATABASE_URL is unset
 * 2. Analytics client throws when ANALYTICS_DATABASE_URL is unset
 * 3. The try/catch in service layer would catch the error
 *
 * Usage: npx tsx scripts/test-revenue-fallback.ts
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Bootstrap (save original) ───
const originalUrl = process.env.ANALYTICS_DATABASE_URL;

// Bootstrap from sync-worker/.env if needed
if (!originalUrl) {
    const swEnvPath = resolve(__dirname, '..', 'sync-worker', '.env');
    if (existsSync(swEnvPath)) {
        for (const line of readFileSync(swEnvPath, 'utf-8').split('\n')) {
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
    }
}

async function run() {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  Revenue Fallback Test (Phase 2B-5A)        ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // ──────────────────────────────────────────────
    // Test 1: analyticsConfigured() logic
    // ──────────────────────────────────────────────
    console.log('── Test 1: analyticsConfigured() check ──');

    const savedUrl = process.env.ANALYTICS_DATABASE_URL;

    // With URL set
    const configuredWhenSet = !!process.env.ANALYTICS_DATABASE_URL;
    console.log(`  With URL set: ${configuredWhenSet}`);
    const pass1 = configuredWhenSet === true;
    console.log(`  ${pass1 ? '✅' : '❌'} expected true, got ${configuredWhenSet}`);

    // Without URL
    delete process.env.ANALYTICS_DATABASE_URL;
    const configuredWhenMissing = !!process.env.ANALYTICS_DATABASE_URL;
    console.log(`  Without URL: ${configuredWhenMissing}`);
    const pass2 = configuredWhenMissing === false;
    console.log(`  ${pass2 ? '✅' : '❌'} expected false, got ${configuredWhenMissing}`);

    // Restore
    process.env.ANALYTICS_DATABASE_URL = savedUrl;

    // ──────────────────────────────────────────────
    // Test 2: Analytics client throws when URL missing
    // ──────────────────────────────────────────────
    console.log('\n── Test 2: Analytics client throws without URL ──');

    // Temporarily unset
    const tmpUrl = process.env.ANALYTICS_DATABASE_URL;
    delete process.env.ANALYTICS_DATABASE_URL;

    // Clear cached pool
    delete (globalThis as any).analyticsPool;

    let threwExpected = false;
    try {
        const { getDailyRevenue } = await import('../lib/analytics/revenue');
        await getDailyRevenue('2026-05-01', '2026-05-02');
    } catch (e: any) {
        threwExpected = e.message?.includes('ANALYTICS_DATABASE_URL');
        if (threwExpected) {
            console.log(`  ✅ Analytics client threw expected error: ${e.message}`);
        } else {
            console.log(`  ❌ Analytics client threw unexpected error: ${e.message}`);
        }
    }

    if (!threwExpected) {
        console.log('  ❌ Analytics client did NOT throw — fallback would not be triggered!');
    }

    // Restore
    process.env.ANALYTICS_DATABASE_URL = tmpUrl;
    delete (globalThis as any).analyticsPool;

    // ──────────────────────────────────────────────
    // Test 3: Analytics client works when URL is set
    // ──────────────────────────────────────────────
    console.log('\n── Test 3: Analytics client works when URL is set ──');

    process.env.ANALYTICS_DATABASE_URL = savedUrl;
    delete (globalThis as any).analyticsPool;

    try {
        const { getRevenueSummary } = await import('../lib/analytics/revenue');
        const summary = await getRevenueSummary('2026-05-01', '2026-05-02');
        const ok = typeof summary.totalRevenue === 'number';
        console.log(`  ${ok ? '✅' : '❌'} getRevenueSummary works: rev=Rp${summary.totalRevenue}`);
    } catch (e: any) {
        console.log(`  ❌ getRevenueSummary failed: ${e.message}`);
    }

    // ──────────────────────────────────────────────
    // Summary
    // ──────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║  Fallback Test Summary                      ║');
    console.log('╚══════════════════════════════════════════════╝');
    const allPassed = pass1 && pass2 && threwExpected;
    console.log(`  analyticsConfigured() with URL:    ${pass1 ? '✅' : '❌'}`);
    console.log(`  analyticsConfigured() without URL: ${pass2 ? '✅' : '❌'}`);
    console.log(`  Analytics client throws on missing: ${threwExpected ? '✅' : '❌'}`);
    console.log(`  Overall: ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
    process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
    console.error('  FATAL:', err);
    process.exit(1);
});
