// @ts-nocheck
/**
 * Manual validation script for AI Settings fixes.
 * Run with: npx tsx scripts/validate-ai-settings-fix.ts
 *
 * Tests:
 * 1. shouldSendKey logic (new vs existing provider)
 * 2. apiKeySet detection
 * 3. Masked key rejection (isMaskedApiKey)
 */
(() => {
    // ── isMaskedApiKey from AISettingsPage.tsx ──────────────────────────────────
    const MASKED_PATTERNS = [
        /^\*+$/,
        /^•+$/,
        /^\.+$/,
        /^x+$/i,
        /^s[ke][-_]?.*\*{3,}/i,
        /^sk-[^*]{0,3}\*{3,}$/i,
    ];

    function isMaskedApiKey(key: string): boolean {
        if (!key || key.length < 4) return false;
        return MASKED_PATTERNS.some((p) => p.test(key.trim()));
    }

    // ── shouldSendKey logic simulation ─────────────────────────────────────────
    interface SimResult {
        old: boolean;
        new_: boolean;
        wouldBlockOld: boolean;
        wouldBlockNew: boolean;
    }

    function simulateHandleSave(
        draftApiKey: string,
        apiKeySet: boolean,
        isEditingApiKey: boolean
    ): SimResult {
        const shouldSendKeyV1 = isEditingApiKey && !!draftApiKey.trim(); // OLD logic
        const shouldSendKeyV2 = !!draftApiKey.trim(); // NEW logic (FIX 2)

        return {
            old: shouldSendKeyV1,
            new_: shouldSendKeyV2,
            wouldBlockOld: !shouldSendKeyV1 && !apiKeySet,
            wouldBlockNew: !shouldSendKeyV2 && !apiKeySet,
        };
    }

    // ── Assertions ──────────────────────────────────────────────────────────────
    let passed = 0;
    let failed = 0;

    function assert(cond: boolean, label: string) {
        if (cond) {
            passed++;
            console.log(`  ✅ ${label}`);
        } else {
            failed++;
            console.error(`  ❌ ${label}`);
        }
    }

    console.log('\n=== Test 1: New provider with valid key ===');
    {
        const r = simulateHandleSave('sk-test123', false, false);
        assert(r.old === false, 'OLD: shouldSendKey=false (no editing mode)');
        assert(r.new_ === true, 'NEW: shouldSendKey=true (has content)');
        assert(r.wouldBlockOld === true, 'OLD: would block new provider save');
        assert(r.wouldBlockNew === false, 'NEW: would NOT block new provider save');
    }

    console.log('\n=== Test 2: Existing provider, no edit, key exists ===');
    {
        const r = simulateHandleSave('', true, false);
        assert(r.old === false, 'OLD: shouldSendKey=false');
        assert(r.new_ === false, 'NEW: shouldSendKey=false');
        assert(r.wouldBlockOld === false, 'OLD: not blocked (apiKeySet=true)');
        assert(r.wouldBlockNew === false, 'NEW: not blocked (apiKeySet=true)');
    }

    console.log('\n=== Test 3: New provider, empty key ===');
    {
        const r = simulateHandleSave('', false, true);
        assert(r.old === false, 'OLD: shouldSendKey=false (empty)');
        assert(r.new_ === false, 'NEW: shouldSendKey=false (empty)');
        assert(r.wouldBlockOld === true, 'OLD: blocked (no key, no existing)');
        assert(r.wouldBlockNew === true, 'NEW: blocked (no key, no existing)');
    }

    console.log('\n=== Test 4: Existing provider, editing with new key ===');
    {
        const r = simulateHandleSave('sk-new-key', true, true);
        assert(r.old === true, 'OLD: shouldSendKey=true (editing+has content)');
        assert(r.new_ === true, 'NEW: shouldSendKey=true (has content)');
        assert(r.wouldBlockOld === false, 'OLD: not blocked');
        assert(r.wouldBlockNew === false, 'NEW: not blocked');
    }

    console.log('\n=== Test 5: Existing provider with whitespace-only key ===');
    {
        const r = simulateHandleSave('   ', true, true);
        assert(r.old === false, 'OLD: shouldSendKey=false (whitespace)');
        assert(r.new_ === false, 'NEW: shouldSendKey=false (whitespace)');
        assert(r.wouldBlockOld === false, 'OLD: not blocked (apiKeySet=true)');
        assert(r.wouldBlockNew === false, 'NEW: not blocked (apiKeySet=true)');
    }

    console.log('\n=== Test 6: isMaskedApiKey ===');
    {
        assert(isMaskedApiKey('****') === true, '**** is masked');
        assert(isMaskedApiKey('••••••••') === true, '•••••••• is masked');
        assert(isMaskedApiKey('sk-***') === true, 'sk-*** is masked');
        assert(isMaskedApiKey('xxxxxxxx') === true, 'xxxxxxxx is masked');
        assert(isMaskedApiKey('sk-proj-real-key-123') === false, 'real key not masked');
        assert(isMaskedApiKey('') === false, 'empty not masked');
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    process.exit(failed > 0 ? 1 : 0);
})();
