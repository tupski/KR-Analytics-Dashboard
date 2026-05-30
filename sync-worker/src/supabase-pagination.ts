import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetch ALL rows from a Supabase table with cursor pagination.
 * Safe for tables exceeding Supabase's 5000-row query limit.
 *
 * Tables MUST have an `id` column for cursor-based pagination.
 *
 * @param supabase  - Supabase client instance
 * @param table     - Table name
 * @param columns   - Columns to select (default: '*')
 * @param options   - Optional: filter, orderBy, batchSize, queryModifier
 *
 * @example
 *   const rows = await fetchAllPaginated(supabase, 'pengeluaran', 'jumlah, created_at')
 *   const rows = await fetchAllPaginated(supabase, 'tagihan_bulanan', '*', {
 *     filter: { status: 'paid' },
 *     queryModifier: (q) => q.gte('due_date', '2026-01-01')
 *   })
 */
export async function fetchAllPaginated<T = any>(
    supabase: SupabaseClient,
    table: string,
    columns: string = '*',
    options?: {
        /** Equality filters: { column: value } → .eq(column, value) */
        filter?: Record<string, any>;
        /** Sort column and direction (default: { column: 'id', ascending: true }) */
        orderBy?: { column: string; ascending?: boolean };
        /** Rows per page (default: 1000, max: 1000) */
        batchSize?: number;
        /**
         * Additional query modifier for range/IN filters.
         * Receives the PostgrestFilterBuilder after .select(), .order(), and .eq() filters.
         * Do NOT call .select(), .order(), .limit(), or cursor-range methods here.
         *
         * @example
         *   (q) => q.gte('tanggal', '2026-01-01').lt('tanggal', '2026-02-01')
         */
        queryModifier?: (query: any) => any;
    }
): Promise<T[]> {
    const BATCH = options?.batchSize ?? 1000;
    const orderCol = options?.orderBy?.column ?? 'id';
    const ascending = options?.orderBy?.ascending ?? true;
    const filter = options?.filter;

    const allRows: T[] = [];
    let cursor = ascending ? 0 : Number.MAX_SAFE_INTEGER;
    let hasMore = true;

    while (hasMore) {
        // Build base query
        let query = supabase
            .from(table)
            .select(columns, { head: false })
            .order(orderCol, { ascending })
            .limit(BATCH);

        // Apply equality filters
        if (filter) {
            for (const [key, value] of Object.entries(filter)) {
                query = query.eq(key, value);
            }
        }

        // Apply additional modifiers (gte, lte, in, etc.)
        if (options?.queryModifier) {
            query = options.queryModifier(query);
        }

        // Apply cursor range
        if (ascending) {
            query = query.gte(orderCol, cursor);
        } else {
            query = query.lte(orderCol, cursor);
        }

        const { data, error } = await query;

        if (error) throw error;
        if (!data || data.length === 0) {
            hasMore = false;
            break;
        }

        allRows.push(...(data as unknown as T[]));

        // If fewer rows than batch size → last page
        if (data.length < BATCH) {
            hasMore = false;
        } else {
            // Advance cursor past last row to avoid duplicates
            const last = data[data.length - 1] as any;
            cursor = ascending
                ? last[orderCol] + 1
                : last[orderCol] - 1;
        }
    }

    return allRows;
}

/**
 * Count rows in a Supabase table safely.
 * Uses `{ head: true, count: 'exact' }` which has no 5000-row limit.
 */
export async function countRows(
    supabase: SupabaseClient,
    table: string,
    filter?: Record<string, any>
): Promise<number> {
    let query = supabase.from(table).select('*', { head: true, count: 'exact' });
    if (filter) {
        for (const [key, value] of Object.entries(filter)) {
            query = query.eq(key, value);
        }
    }
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}
