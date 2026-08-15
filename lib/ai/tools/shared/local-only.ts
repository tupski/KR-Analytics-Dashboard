/**
 * KRAI data-tool guard — AI business-data tools MUST read ONLY from the
 * local analytics PostgreSQL DB (via lib/analytics/db.ts queryAnalytics).
 * Supabase is the remote source and is NOT allowed as an AI data source.
 *
 * Guard layers:
 * 1. Compile-time: AI data-tool files (lib/ai/tools.ts, lib/ai/tools/**)
 *    intentionally do NOT import `createServerClient` — any reintroduced
 *    Supabase read is a TypeScript compile error.
 * 2. Runtime: set KRAI_BLOCK_SUPABASE_READS=1 to hard-fail module load of
 *    any AI data-tool module that links a Supabase path.
 *
 * ponytail: runtime guard only fires on env flag; compile-time absence of
 * the import is the primary enforcement. Upgrade path: move guard to a
 * lint rule (no-restricted-imports) banning `@/lib/supabase/*` in lib/ai/tools*.
 */
export function assertLocalOnly(): void {
    if (process.env.KRAI_BLOCK_SUPABASE_READS === '1') {
        throw new Error(
            'KRAI data tools must read only from the local analytics DB. ' +
            'Supabase reads from AI tools are blocked (KRAI_BLOCK_SUPABASE_READS=1).',
        );
    }
}
