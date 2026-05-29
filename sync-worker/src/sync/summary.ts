import { Pool } from 'pg';
import { updateMetadata } from './metadata';
import { startSyncLog, completeSyncLog } from './logger';

// ─── Types ───────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 90;

export interface RefreshOptions {
    mode: 'window' | 'full';
    windowDays?: number;
}

export interface SummaryResult {
    tableName: string;
    rowsInserted: number;
    durationMs: number;
}

interface SummaryTableRefresh {
    tableName: string;
    fn: (pool: Pool, opts: RefreshOptions) => Promise<SummaryResult>;
}

// ─── WIB Helpers ─────────────────────────────────────────────────────

function getWibNow(): Date {
    const now = new Date();
    return new Date(now.getTime() + 7 * 60 * 60 * 1000);
}

/** Return YYYY-MM-DD cutoff date string (WIB) */
function getCutoffDate(opts: RefreshOptions): string {
    if (opts.mode === 'full') return '1970-01-01';
    const days = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
    const wibDate = getWibNow();
    wibDate.setDate(wibDate.getDate() - days);
    return wibDate.toISOString().split('T')[0];
}

/** Return YYYYMM integer cutoff for month-based tables */
function getCutoffYearMonth(opts: RefreshOptions): number {
    if (opts.mode === 'full') return 0;
    const days = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
    const wibDate = getWibNow();
    wibDate.setDate(wibDate.getDate() - days);
    return wibDate.getFullYear() * 100 + (wibDate.getMonth() + 1);
}

// ─── Metadata Helper ─────────────────────────────────────────────────

async function updateSummaryMetadata(
    pool: Pool,
    tableName: string,
    rowCount: number,
    status: string,
    error: string | null,
    cutoffDate: string | null
): Promise<void> {
    const updates: Record<string, unknown> = {
        last_sync_at: new Date(),
        row_count: rowCount,
        sync_status: status,
        error_message: error,
    };
    if (cutoffDate) {
        updates.summary_refresh_range_start = cutoffDate;
    }
    await updateMetadata(pool, tableName, updates as any);
}

// ═══════════════════════════════════════════════════════════════════════
// 1. analytics_daily_revenue
// ═══════════════════════════════════════════════════════════════════════
//
// Source: local transactions mirror table
// Columns: cash_amount, transfer_amount → cash_revenue, transfer_revenue
// Grouped by: (created_at WIB date, apartment_location)
// Filter: is_deleted = false
//
// ═══════════════════════════════════════════════════════════════════════

export async function refreshDailyRevenue(pool: Pool, opts: RefreshOptions): Promise<SummaryResult> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'analytics_daily_revenue', 'summary');

    try {
        const cutoffDate = getCutoffDate(opts);
        console.log(`[summary:daily_revenue] Mode=${opts.mode}, cutoff=${cutoffDate}`);

        // DELETE window
        const delResult = await pool.query(
            'DELETE FROM analytics_daily_revenue WHERE date_wib >= $1',
            [cutoffDate]
        );
        console.log(`[summary:daily_revenue] Deleted ${delResult.rowCount} rows`);

        // INSERT computed from transactions mirror
        const insResult = await pool.query(`
            INSERT INTO analytics_daily_revenue
                (date_wib, apartment_location, total_revenue, cash_revenue, transfer_revenue,
                 transaction_count, avg_revenue_per_tx, unique_rooms)
            SELECT
                (created_at AT TIME ZONE 'Asia/Jakarta')::DATE as date_wib,
                COALESCE(apartment_location, 'Unknown') as apartment_location,
                COALESCE(SUM(COALESCE(cash_amount,0) + COALESCE(transfer_amount,0)), 0) as total_revenue,
                COALESCE(SUM(COALESCE(cash_amount,0)), 0) as cash_revenue,
                COALESCE(SUM(COALESCE(transfer_amount,0)), 0) as transfer_revenue,
                COUNT(*) as transaction_count,
                CASE WHEN COUNT(*) > 0
                    THEN ROUND(SUM(COALESCE(cash_amount,0) + COALESCE(transfer_amount,0)) / COUNT(*)::numeric, 2)
                    ELSE 0 END as avg_revenue_per_tx,
                COUNT(DISTINCT room_number) as unique_rooms
            FROM transactions
            WHERE is_deleted = false
              AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1
            GROUP BY date_wib, apartment_location
            ORDER BY date_wib, apartment_location
        `, [cutoffDate]);

        const rowsInserted = insResult.rowCount ?? 0;
        const durationMs = Date.now() - startTime;

        await completeSyncLog(pool, logId, 'success', rowsInserted, 0);
        await updateSummaryMetadata(pool, 'analytics_daily_revenue', rowsInserted, 'ok', null, cutoffDate);

        console.log(`[summary:daily_revenue] Done: ${rowsInserted} rows in ${durationMs}ms`);
        return { tableName: 'analytics_daily_revenue', rowsInserted, durationMs };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });
        await updateSummaryMetadata(pool, 'analytics_daily_revenue', 0, 'error', errorMsg, null).catch(() => { });
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 2. analytics_monthly_summary
// ═══════════════════════════════════════════════════════════════════════
//
// Sources:
//   - transactions → revenue (cash_amount + transfer_amount)
//   - pengeluaran → expenses (jumlah)
//   - tagihan_bulanan → bills (paid/unpaid counts & amounts)
//   - tagihan_fee_lunas_items → marketing fees (joined to transactions for location)
// PK: (year, month, apartment_location)
//
// ═══════════════════════════════════════════════════════════════════════

export async function refreshMonthlySummary(pool: Pool, opts: RefreshOptions): Promise<SummaryResult> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'analytics_monthly_summary', 'summary');

    try {
        const cutoffDate = getCutoffDate(opts);
        const cutoffYM = getCutoffYearMonth(opts);
        console.log(`[summary:monthly] Mode=${opts.mode}, cutoff_ym=${cutoffYM}`);

        // DELETE window
        const delResult = await pool.query(
            'DELETE FROM analytics_monthly_summary WHERE (year * 100 + month) >= $1',
            [cutoffYM]
        );
        console.log(`[summary:monthly] Deleted ${delResult.rowCount} rows`);

        // ── Step 1: INSERT revenue data from transactions ──
        const revResult = await pool.query(`
            INSERT INTO analytics_monthly_summary
                (year, month, apartment_location, total_revenue, cash_revenue, transfer_revenue, transaction_count)
            SELECT
                EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Asia/Jakarta'))::int as year,
                EXTRACT(MONTH FROM (created_at AT TIME ZONE 'Asia/Jakarta'))::int as month,
                COALESCE(apartment_location, 'Unknown') as apartment_location,
                COALESCE(SUM(COALESCE(cash_amount,0) + COALESCE(transfer_amount,0)), 0) as total_revenue,
                COALESCE(SUM(COALESCE(cash_amount,0)), 0) as cash_revenue,
                COALESCE(SUM(COALESCE(transfer_amount,0)), 0) as transfer_revenue,
                COUNT(*) as transaction_count
            FROM transactions
            WHERE is_deleted = false
              AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1
            GROUP BY year, month, apartment_location
        `, [cutoffDate]);
        console.log(`[summary:monthly] Revenue rows: ${revResult.rowCount}`);

        // ── Step 2: UPSERT expenses from pengeluaran ──
        // First, UPDATE existing rows that already have revenue
        const expResult = await pool.query(`
            UPDATE analytics_monthly_summary m
            SET
                total_expenses = sub.total_expenses,
                expense_count = sub.expense_count
            FROM (
                SELECT
                    EXTRACT(YEAR FROM tanggal)::int as year,
                    EXTRACT(MONTH FROM tanggal)::int as month,
                    COALESCE(apartment_location, 'Unknown') as apartment_location,
                    COALESCE(SUM(jumlah), 0) as total_expenses,
                    COUNT(*) as expense_count
                FROM pengeluaran
                WHERE is_deleted = false
                  AND tanggal >= $1::date
                GROUP BY year, month, apartment_location
            ) sub
            WHERE m.year = sub.year AND m.month = sub.month AND m.apartment_location = sub.apartment_location
        `, [cutoffDate]);
        console.log(`[summary:monthly] Expenses updated: ${expResult.rowCount} rows`);

        // Then INSERT rows for months that have expenses but no revenue yet
        await pool.query(`
            INSERT INTO analytics_monthly_summary
                (year, month, apartment_location, total_expenses, expense_count)
            SELECT
                sub.year, sub.month, sub.apartment_location,
                sub.total_expenses, sub.expense_count
            FROM (
                SELECT
                    EXTRACT(YEAR FROM tanggal)::int as year,
                    EXTRACT(MONTH FROM tanggal)::int as month,
                    COALESCE(apartment_location, 'Unknown') as apartment_location,
                    COALESCE(SUM(jumlah), 0) as total_expenses,
                    COUNT(*) as expense_count
                FROM pengeluaran
                WHERE is_deleted = false
                  AND tanggal >= $1::date
                GROUP BY year, month, apartment_location
            ) sub
            WHERE NOT EXISTS (
                SELECT 1 FROM analytics_monthly_summary m
                WHERE m.year = sub.year AND m.month = sub.month AND m.apartment_location = sub.apartment_location
            )
        `, [cutoffDate]);

        // ── Step 3: UPSERT bills from tagihan_bulanan ──
        // UPDATE existing rows
        await pool.query(`
            UPDATE analytics_monthly_summary m
            SET
                paid_bills_count = sub.paid_count,
                unpaid_bills_count = sub.unpaid_count,
                paid_bills_amount = sub.paid_amount,
                unpaid_bills_amount = sub.unpaid_amount
            FROM (
                SELECT
                    EXTRACT(YEAR FROM due_date)::int as year,
                    EXTRACT(MONTH FROM due_date)::int as month,
                    COALESCE(apartment_location, 'Unknown') as apartment_location,
                    COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
                    COUNT(*) FILTER (WHERE status = 'unpaid') as unpaid_count,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'), 0) as unpaid_amount
                FROM tagihan_bulanan
                WHERE is_deleted = false
                  AND due_date >= $1::date
                GROUP BY year, month, apartment_location
            ) sub
            WHERE m.year = sub.year AND m.month = sub.month AND m.apartment_location = sub.apartment_location
        `, [cutoffDate]);

        // INSERT rows for bill-only months
        await pool.query(`
            INSERT INTO analytics_monthly_summary
                (year, month, apartment_location, paid_bills_count, unpaid_bills_count,
                 paid_bills_amount, unpaid_bills_amount)
            SELECT
                sub.year, sub.month, sub.apartment_location,
                sub.paid_count, sub.unpaid_count,
                sub.paid_amount, sub.unpaid_amount
            FROM (
                SELECT
                    EXTRACT(YEAR FROM due_date)::int as year,
                    EXTRACT(MONTH FROM due_date)::int as month,
                    COALESCE(apartment_location, 'Unknown') as apartment_location,
                    COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
                    COUNT(*) FILTER (WHERE status = 'unpaid') as unpaid_count,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'unpaid'), 0) as unpaid_amount
                FROM tagihan_bulanan
                WHERE is_deleted = false
                  AND due_date >= $1::date
                GROUP BY year, month, apartment_location
            ) sub
            WHERE NOT EXISTS (
                SELECT 1 FROM analytics_monthly_summary m
                WHERE m.year = sub.year AND m.month = sub.month AND m.apartment_location = sub.apartment_location
            )
        `, [cutoffDate]);

        // ── Step 4: UPDATE marketing fees from tagihan_fee_lunas_items ──
        // Join to transactions for apartment_location
        await pool.query(`
            UPDATE analytics_monthly_summary m
            SET
                total_marketing_fees = sub.total_fees,
                paid_fees_amount = sub.total_fees
            FROM (
                SELECT
                    EXTRACT(YEAR FROM (t.created_at AT TIME ZONE 'Asia/Jakarta'))::int as year,
                    EXTRACT(MONTH FROM (t.created_at AT TIME ZONE 'Asia/Jakarta'))::int as month,
                    COALESCE(t.apartment_location, 'Unknown') as apartment_location,
                    COALESCE(SUM(i.fee_amount), 0) as total_fees
                FROM tagihan_fee_lunas_items i
                JOIN transactions t ON t.id = i.transaction_id
                WHERE i.is_deleted = false AND t.is_deleted = false
                  AND (t.created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1
                GROUP BY year, month, apartment_location
            ) sub
            WHERE m.year = sub.year AND m.month = sub.month AND m.apartment_location = sub.apartment_location
        `, [cutoffDate]);

        // ── Step 5: Compute net_profit for all affected rows ──
        const profitResult = await pool.query(`
            UPDATE analytics_monthly_summary
            SET net_profit = COALESCE(total_revenue, 0) - COALESCE(total_expenses, 0),
                computed_at = NOW()
            WHERE (year * 100 + month) >= $1
        `, [cutoffYM]);
        console.log(`[summary:monthly] Net profit updated: ${profitResult.rowCount} rows`);

        // Count total rows in window
        const countResult = await pool.query(
            'SELECT COUNT(*) as cnt FROM analytics_monthly_summary WHERE (year * 100 + month) >= $1',
            [cutoffYM]
        );
        const rowsInserted = parseInt(countResult.rows[0]?.cnt || '0', 10);
        const durationMs = Date.now() - startTime;

        await completeSyncLog(pool, logId, 'success', rowsInserted, 0);
        await updateSummaryMetadata(pool, 'analytics_monthly_summary', rowsInserted, 'ok', null, cutoffDate);

        console.log(`[summary:monthly] Done: ${rowsInserted} rows in ${durationMs}ms`);
        return { tableName: 'analytics_monthly_summary', rowsInserted, durationMs };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });
        await updateSummaryMetadata(pool, 'analytics_monthly_summary', 0, 'error', errorMsg, null).catch(() => { });
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. analytics_expense_summary
// ═══════════════════════════════════════════════════════════════════════
//
// Source: local pengeluaran mirror table
// Columns: tanggal → date_wib, apartment_location, category → category
// Grouped by: (tanggal, apartment_location, category)
// Filter: is_deleted = false
//
// ═══════════════════════════════════════════════════════════════════════

export async function refreshExpenseSummary(pool: Pool, opts: RefreshOptions): Promise<SummaryResult> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'analytics_expense_summary', 'summary');

    try {
        const cutoffDate = getCutoffDate(opts);
        console.log(`[summary:expense] Mode=${opts.mode}, cutoff=${cutoffDate}`);

        // DELETE window
        const delResult = await pool.query(
            'DELETE FROM analytics_expense_summary WHERE date_wib >= $1',
            [cutoffDate]
        );
        console.log(`[summary:expense] Deleted ${delResult.rowCount} rows`);

        // INSERT computed from pengeluaran mirror
        const insResult = await pool.query(`
            INSERT INTO analytics_expense_summary
                (date_wib, apartment_location, category, total_amount, expense_count)
            SELECT
                tanggal as date_wib,
                COALESCE(apartment_location, 'Unknown') as apartment_location,
                COALESCE(category, 'Lainnya') as category,
                COALESCE(SUM(jumlah), 0) as total_amount,
                COUNT(*) as expense_count
            FROM pengeluaran
            WHERE is_deleted = false
              AND tanggal >= $1::date
            GROUP BY tanggal, apartment_location, category
            ORDER BY tanggal, apartment_location, category
        `, [cutoffDate]);

        const rowsInserted = insResult.rowCount ?? 0;
        const durationMs = Date.now() - startTime;

        await completeSyncLog(pool, logId, 'success', rowsInserted, 0);
        await updateSummaryMetadata(pool, 'analytics_expense_summary', rowsInserted, 'ok', null, cutoffDate);

        console.log(`[summary:expense] Done: ${rowsInserted} rows in ${durationMs}ms`);
        return { tableName: 'analytics_expense_summary', rowsInserted, durationMs };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });
        await updateSummaryMetadata(pool, 'analytics_expense_summary', 0, 'error', errorMsg, null).catch(() => { });
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. analytics_occupancy_daily
// ═══════════════════════════════════════════════════════════════════════
//
// OCCUPANCY DEFINITION (conservative — Phase 1):
//   A room is considered "occupied" on a given date (WIB) if there is
//   at least 1 transaction recorded for that room on that date,
//   based on (created_at AT TIME ZONE 'Asia/Jakarta')::DATE.
//
// LIMITATIONS:
//   - This uses created_at, NOT actual checkin/checkout dates.
//   - A multi-night stay is only counted on the checkin/creation date,
//     not for each night of the stay.
//   - This represents "transaction date" occupancy, not "nightly stay"
//     occupancy. For truer occupancy, would need checkin_at/checkout_at
//     spanning logic.
//
// Source: local transactions mirror table
// PK: (date_wib, apartment_location, room_number)
// Filter: is_deleted = false, room_number IS NOT NULL
//
// ═══════════════════════════════════════════════════════════════════════

export async function refreshOccupancyDaily(pool: Pool, opts: RefreshOptions): Promise<SummaryResult> {
    const startTime = Date.now();
    const logId = await startSyncLog(pool, 'analytics_occupancy_daily', 'summary');

    try {
        const cutoffDate = getCutoffDate(opts);
        console.log(`[summary:occupancy] Mode=${opts.mode}, cutoff=${cutoffDate}`);

        // DELETE window
        const delResult = await pool.query(
            'DELETE FROM analytics_occupancy_daily WHERE date_wib >= $1',
            [cutoffDate]
        );
        console.log(`[summary:occupancy] Deleted ${delResult.rowCount} rows`);

        // INSERT: One row per (date, location, room) that has ≥1 transaction.
        // GROUP BY avoids PK conflict when room has multiple transactions same day.
        const insResult = await pool.query(`
            INSERT INTO analytics_occupancy_daily
                (date_wib, apartment_location, room_number, is_occupied)
            SELECT
                (created_at AT TIME ZONE 'Asia/Jakarta')::DATE as date_wib,
                COALESCE(apartment_location, 'Unknown') as apartment_location,
                COALESCE(room_number, 'Unknown') as room_number,
                TRUE as is_occupied
            FROM transactions
            WHERE is_deleted = false
              AND room_number IS NOT NULL
              AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $1
            GROUP BY date_wib, apartment_location, room_number
            ORDER BY date_wib, apartment_location, room_number
        `, [cutoffDate]);

        const rowsInserted = insResult.rowCount ?? 0;
        const durationMs = Date.now() - startTime;

        await completeSyncLog(pool, logId, 'success', rowsInserted, 0);
        await updateSummaryMetadata(pool, 'analytics_occupancy_daily', rowsInserted, 'ok', null, cutoffDate);

        console.log(`[summary:occupancy] Done: ${rowsInserted} rows in ${durationMs}ms`);
        return { tableName: 'analytics_occupancy_daily', rowsInserted, durationMs };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await completeSyncLog(pool, logId, 'error', 0, 0, errorMsg).catch(() => { });
        await updateSummaryMetadata(pool, 'analytics_occupancy_daily', 0, 'error', errorMsg, null).catch(() => { });
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. refreshAllSummaries — run all 4 in sequence
// ═══════════════════════════════════════════════════════════════════════

export interface SyncResult {
    status: 'success' | 'error' | 'partial';
    summaries: SummaryResult[];
    errorMessage?: string;
}

export async function refreshAllSummaries(pool: Pool, opts: RefreshOptions): Promise<SyncResult> {
    console.log('\n' + '='.repeat(70));
    console.log('[summary] Starting summary refresh');
    console.log(`[summary] Mode: ${opts.mode}, window: ${opts.windowDays ?? DEFAULT_WINDOW_DAYS} days`);
    console.log('='.repeat(70));

    const tables: SummaryTableRefresh[] = [
        { tableName: 'analytics_daily_revenue', fn: refreshDailyRevenue },
        { tableName: 'analytics_monthly_summary', fn: refreshMonthlySummary },
        { tableName: 'analytics_expense_summary', fn: refreshExpenseSummary },
        { tableName: 'analytics_occupancy_daily', fn: refreshOccupancyDaily },
    ];

    const results: SummaryResult[] = [];
    let hasError = false;

    for (const t of tables) {
        try {
            const result = await t.fn(pool, opts);
            results.push(result);
        } catch (err) {
            hasError = true;
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[summary] ${t.tableName} FAILED: ${errorMsg}`);
            results.push({ tableName: t.tableName, rowsInserted: 0, durationMs: 0 });
        }
    }

    console.log('='.repeat(70));
    console.log('[summary] Summary refresh complete:');
    for (const r of results) {
        const status = r.durationMs === 0 ? 'FAILED' : 'ok';
        console.log(`  ${r.tableName.padEnd(35)} ${String(r.rowsInserted).padStart(8)} rows  ${status}`);
    }
    console.log('='.repeat(70));

    return {
        status: hasError ? 'partial' : 'success',
        summaries: results,
    };
}
