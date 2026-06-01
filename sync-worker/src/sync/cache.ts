/**
 * Sync-Worker: Cache Invalidation & Mart Refresh
 *
 * Post-sync hook that:
 *   1. Invalidates analytics_query_cache entries (so next query re-computes)
 *   2. Optionally pre-populates analytics_cache_mart rows for common queries
 *
 * Controlled by env vars:
 *   CACHE_INVALIDATE_ON_SYNC  (default: true)
 *   MART_REFRESH_MODE         (default: partial; values: none | partial | full)
 */

import { Pool } from 'pg';

export interface CacheInvalidateResult {
    invalidatedCount: number;
    martRefreshed: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Invalidation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Invalidate analytics query cache.
 * When metricName is provided, only invalidates entries with that metric.
 * Otherwise invalidates ALL fresh entries.
 * Returns count of invalidated rows.
 */
export async function invalidateAnalyticsCache(
    pool: Pool,
    metricName?: string
): Promise<number> {
    if (metricName) {
        const result = await pool.query(
            `SELECT analytics_invalidate_cache($1) as "count"`,
            [metricName]
        );
        return Number(result.rows[0]?.count ?? 0);
    }

    const result = await pool.query(
        `SELECT analytics_invalidate_cache(NULL::TEXT) as "count"`
    );
    return Number(result.rows[0]?.count ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Mart Refresh — individual marts
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Refresh dashboard_kpi mart from analytics_daily_revenue.
 * Computes today's KPIs per location.
 */
async function refreshMartDashboardKpi(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, result, generated_at, expires_at
        )
        SELECT
            'dashboard_kpi' as mart_name,
            'total_revenue' as metric_name,
            CURRENT_DATE as range_start,
            CURRENT_DATE as range_end,
            'calendar_day' as report_period_mode,
            apartment_location,
            jsonb_build_object(
                'total_revenue', COALESCE(SUM(total_revenue), 0),
                'cash_revenue', COALESCE(SUM(cash_revenue), 0),
                'transfer_revenue', COALESCE(SUM(transfer_revenue), 0),
                'transaction_count', COALESCE(SUM(transaction_count), 0),
                'unique_rooms', COALESCE(SUM(unique_rooms), 0)
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '5 minutes' as expires_at
        FROM analytics_daily_revenue
        WHERE date_wib = CURRENT_DATE
        GROUP BY apartment_location
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh occupancy_by_location mart from analytics_daily_revenue and analytics_occupancy_daily.
 */
async function refreshMartOccupancyByLocation(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, result, generated_at, expires_at
        )
        SELECT
            'occupancy_by_location' as mart_name,
            'occupancy_rate' as metric_name,
            CURRENT_DATE as range_start,
            CURRENT_DATE as range_end,
            'calendar_day' as report_period_mode,
            od.apartment_location,
            jsonb_build_object(
                'total_rooms', COUNT(DISTINCT od.room_number),
                'occupied_rooms', COUNT(DISTINCT od.room_number) FILTER (WHERE od.is_occupied),
                'occupancy_rate', ROUND(
                    COUNT(DISTINCT od.room_number) FILTER (WHERE od.is_occupied)::numeric /
                    NULLIF(COUNT(DISTINCT od.room_number), 0), 4
                ),
                'total_revenue', COALESCE(SUM(dr.total_revenue), 0)
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '5 minutes' as expires_at
        FROM analytics_occupancy_daily od
        LEFT JOIN analytics_daily_revenue dr
            ON dr.date_wib = od.date_wib AND dr.apartment_location = od.apartment_location
        WHERE od.date_wib = CURRENT_DATE
        GROUP BY od.apartment_location
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh revenue_by_period mart: monthly revenue trends per location.
 */
async function refreshMartRevenueByPeriod(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, result, generated_at, expires_at
        )
        SELECT
            'revenue_by_period' as mart_name,
            'monthly_revenue' as metric_name,
            (year || '-' || LPAD(month::text, 2, '01'))::DATE as range_start,
            (year || '-' || LPAD(month::text, 2, '01'))::DATE + INTERVAL '1 month' - INTERVAL '1 day' as range_end,
            'calendar_day' as report_period_mode,
            apartment_location,
            jsonb_build_object(
                'year', year,
                'month', month,
                'total_revenue', total_revenue,
                'cash_revenue', cash_revenue,
                'transfer_revenue', transfer_revenue,
                'transaction_count', transaction_count,
                'net_profit', net_profit,
                'total_expenses', total_expenses
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '30 minutes' as expires_at
        FROM analytics_monthly_summary
        WHERE (year * 100 + month) >= TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYYMM')::INTEGER
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh expense_breakdown mart.
 */
async function refreshMartExpenseBreakdown(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, category, result, generated_at, expires_at
        )
        SELECT
            'expense_breakdown' as mart_name,
            'expense_by_category' as metric_name,
            MIN(date_wib) as range_start,
            MAX(date_wib) as range_end,
            'calendar_day' as report_period_mode,
            apartment_location,
            category,
            jsonb_build_object(
                'total_amount', SUM(total_amount),
                'expense_count', SUM(expense_count)
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '30 minutes' as expires_at
        FROM analytics_expense_summary
        WHERE date_wib >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY apartment_location, category
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh billing_breakdown mart.
 */
async function refreshMartBillingBreakdown(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, result, generated_at, expires_at
        )
        SELECT
            'billing_breakdown' as mart_name,
            'billing_summary' as metric_name,
            CURRENT_DATE - INTERVAL '30 days' as range_start,
            CURRENT_DATE as range_end,
            'calendar_day' as report_period_mode,
            apartment_location,
            jsonb_build_object(
                'paid_count', COALESCE(SUM(paid_bills_count), 0),
                'unpaid_count', COALESCE(SUM(unpaid_bills_count), 0),
                'paid_amount', COALESCE(SUM(paid_bills_amount), 0),
                'unpaid_amount', COALESCE(SUM(unpaid_bills_amount), 0)
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '30 minutes' as expires_at
        FROM analytics_monthly_summary
        WHERE (year * 100 + month) >= TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYYMM')::INTEGER
        GROUP BY apartment_location
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh checkin_busy_hours mart.
 * Computes hourly checkin distribution from transactions mirror table.
 */
async function refreshMartCheckinBusyHours(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, result, generated_at, expires_at
        )
        SELECT
            'checkin_busy_hours' as mart_name,
            'hourly_distribution' as metric_name,
            CURRENT_DATE - INTERVAL '30 days' as range_start,
            CURRENT_DATE as range_end,
            'calendar_day' as report_period_mode,
            apartment_location,
            jsonb_agg(
                jsonb_build_object(
                    'hour', EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Jakarta'),
                    'count', cnt
                ) ORDER BY hour
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '30 minutes' as expires_at
        FROM (
            SELECT
                apartment_location,
                EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Jakarta')::INT as hour,
                COUNT(*) as cnt
            FROM transactions
            WHERE is_deleted = false
              AND created_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY apartment_location, hour
        ) sub
        GROUP BY apartment_location
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh stay_duration mart.
 */
async function refreshMartStayDuration(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, result, generated_at, expires_at
        )
        SELECT
            'stay_duration' as mart_name,
            'duration_distribution' as metric_name,
            CURRENT_DATE - INTERVAL '30 days' as range_start,
            CURRENT_DATE as range_end,
            'calendar_day' as report_period_mode,
            apartment_location,
            jsonb_build_object(
                'transit', COUNT(*) FILTER (WHERE rental_duration = 0),
                'fullday', COUNT(*) FILTER (WHERE rental_duration = 1),
                'multinight', COUNT(*) FILTER (WHERE rental_duration > 1),
                'avg_duration', ROUND(AVG(rental_duration), 2)
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '30 minutes' as expires_at
        FROM transactions
        WHERE is_deleted = false
          AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY apartment_location
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh weekday_weekend mart.
 */
async function refreshMartWeekdayWeekend(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, result, generated_at, expires_at
        )
        SELECT
            'weekday_weekend' as mart_name,
            'weekday_vs_weekend' as metric_name,
            CURRENT_DATE - INTERVAL '30 days' as range_start,
            CURRENT_DATE as range_end,
            'calendar_day' as report_period_mode,
            COALESCE(apartment_location, 'Unknown'),
            jsonb_build_object(
                'type', CASE WHEN EXTRACT(DOW FROM (created_at AT TIME ZONE 'Asia/Jakarta')::DATE) IN (0, 6) THEN 'weekend' ELSE 'weekday' END,
                'transaction_count', COUNT(*),
                'total_revenue', SUM(COALESCE(cash_amount, 0) + COALESCE(transfer_amount, 0))
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '30 minutes' as expires_at
        FROM transactions
        WHERE is_deleted = false
          AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY apartment_location, CASE WHEN EXTRACT(DOW FROM (created_at AT TIME ZONE 'Asia/Jakarta')::DATE) IN (0, 6) THEN 'weekend' ELSE 'weekday' END
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

/**
 * Refresh unit_performance mart.
 */
async function refreshMartUnitPerformance(pool: Pool): Promise<void> {
    await pool.query(`
        INSERT INTO analytics_cache_mart (
            mart_name, metric_name, range_start, range_end,
            report_period_mode, location, unit_id, result, generated_at, expires_at
        )
        SELECT
            'unit_performance' as mart_name,
            'unit_revenue' as metric_name,
            CURRENT_DATE - INTERVAL '30 days' as range_start,
            CURRENT_DATE as range_end,
            'calendar_day' as report_period_mode,
            apartment_location,
            NULL as unit_id,
            jsonb_build_object(
                'room_number', room_number,
                'transaction_count', COUNT(*),
                'total_revenue', SUM(COALESCE(cash_amount, 0) + COALESCE(transfer_amount, 0)),
                'last_booking', MAX(created_at)
            ) as result,
            NOW() as generated_at,
            NOW() + INTERVAL '30 minutes' as expires_at
        FROM transactions
        WHERE is_deleted = false
          AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY apartment_location, room_number
        ON CONFLICT (mart_name, metric_name, COALESCE(range_start, '1970-01-01'::DATE), COALESCE(range_end, '1970-01-01'::DATE), COALESCE(location, ''), 0)
        DO UPDATE SET
            result       = EXCLUDED.result,
            generated_at = EXCLUDED.generated_at,
            expires_at   = EXCLUDED.expires_at,
            updated_at   = NOW()
    `);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mart refresh mode.
 *   - 'none':    skip entirely
 *   - 'partial': refresh today/7-day marts (dashboard_kpi, occupancy, revenue)
 *   - 'full':    refresh ALL marts
 */
export type MartRefreshMode = 'none' | 'partial' | 'full';

interface MartTask {
    name: string;
    fn: (pool: Pool) => Promise<void>;
}

const PARTIAL_MARTS: MartTask[] = [
    { name: 'dashboard_kpi', fn: refreshMartDashboardKpi },
    { name: 'occupancy_by_location', fn: refreshMartOccupancyByLocation },
    { name: 'revenue_by_period', fn: refreshMartRevenueByPeriod },
];

const FULL_MARTS: MartTask[] = [
    ...PARTIAL_MARTS,
    { name: 'expense_breakdown', fn: refreshMartExpenseBreakdown },
    { name: 'billing_breakdown', fn: refreshMartBillingBreakdown },
    { name: 'checkin_busy_hours', fn: refreshMartCheckinBusyHours },
    { name: 'stay_duration', fn: refreshMartStayDuration },
    { name: 'weekday_weekend', fn: refreshMartWeekdayWeekend },
    { name: 'unit_performance', fn: refreshMartUnitPerformance },
];

/**
 * Refresh mart cache tables.
 *
 * @param pool  database pool
 * @param mode  refresh scope: 'none' | 'partial' | 'full'
 * @returns     list of refreshed mart names
 */
export async function refreshMartCache(
    pool: Pool,
    mode: MartRefreshMode
): Promise<string[]> {
    if (mode === 'none') return [];

    const tasks = mode === 'full' ? FULL_MARTS : PARTIAL_MARTS;
    const refreshed: string[] = [];

    for (const task of tasks) {
        try {
            await task.fn(pool);
            refreshed.push(task.name);
            console.log(`[cache:mart] Refreshed ${task.name}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[cache:mart] ${task.name} FAILED: ${msg}`);
        }
    }

    return refreshed;
}
