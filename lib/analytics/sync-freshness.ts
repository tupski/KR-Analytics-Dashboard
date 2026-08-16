import { queryAnalytics } from './db';

// ─── Public types ───

export type SyncStatus = 'healthy' | 'stale' | 'error' | 'unavailable';

export interface SyncFreshnessResult {
  status: SyncStatus;
  lastSyncAt: Date | null;
  lastSyncAtWIB: string | null;
  rowsSyncedLastRun: number | null;
  errorMessage: string | null;
  tableStatuses?: TableSyncStatus[];
}

export interface TableSyncStatus {
  tableName: string;
  status: SyncStatus;
  lastSyncAt: Date | null;
  rowsSynced: number | null;
}

// ─── Helpers ───

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Format a Date into "29 Mei 2026 16:05 WIB" using manual UTC+7 offset. */
function formatWIB(date: Date): string {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const d = wib.getUTCDate();
  const m = MONTHS_ID[wib.getUTCMonth()];
  const y = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${d} ${m} ${y} ${hh}:${mm} WIB`;
}

function isStale(lastSyncAt: Date): boolean {
  return Date.now() - lastSyncAt.getTime() > STALE_THRESHOLD_MS;
}

// ─── Table grouping: logical display name → physical sync_metadata tables ───

const TABLE_GROUPS: Record<string, string[]> = {
  transactions: ['transactions'],
  pengeluaran: ['pengeluaran'],
  tagihan_bulanan: ['tagihan_bulanan'],
  tagihan_fee_lunas: ['tagihan_fee_lunas', 'tagihan_fee_lunas_items'],
  master_tables: [
    'nomor_kamar',
    'lokasi_apartemen',
    'pengeluaran_categories',
    'marketing_list',
    'karyawan_list',
  ],
  summary_refresh: [
    'analytics_daily_revenue',
    'analytics_monthly_summary',
    'analytics_occupancy_daily',
    'analytics_expense_summary',
  ],
};

// ─── Internal row types (from pg) ───

interface SyncMetaRow {
  table_name: string;
  last_sync_at: string | null;
  sync_status: string | null;
  error_message: string | null;
}

interface SyncLogLatestRow {
  status: string;
  rows_synced: number | null;
  error_message: string | null;
  started_at: string | null;
}

// ─── Main helper ───

/**
 * Query the analytics DB for sync freshness status.
 *
 * Always returns a normalized SyncFreshnessResult — never throws.
 * - Queries sync_metadata and sync_logs
 * - Determines overall health: healthy / stale / error / unavailable
 * - Returns per-table breakdown grouped by logical table name
 */
export async function getSyncFreshnessResult(): Promise<SyncFreshnessResult> {
  try {
    // 1. All sync_metadata rows
    const metaRows = await queryAnalytics<SyncMetaRow>(
      `SELECT table_name, last_sync_at, sync_status, error_message
       FROM sync_metadata
       ORDER BY table_name`,
    );

    if (!metaRows || metaRows.length === 0) {
      return emptyResult('Belum ada data sinkronisasi');
    }

    // 2. Latest sync log entry (overall)
    const logRows = await queryAnalytics<SyncLogLatestRow>(
      `SELECT status, rows_synced, error_message, started_at
       FROM sync_logs
       ORDER BY started_at DESC
       LIMIT 1`,
    );

    const latestLog = logRows[0] ?? null;

    // 3. Error detection
    const hasMetaError = metaRows.some(
      (r) => r.sync_status === 'error' || (r.error_message?.length ?? 0) > 0,
    );
    const hasLogError = latestLog?.status === 'error';

    const errorMessage =
      hasMetaError
        ? (metaRows.find((r) => r.error_message)?.error_message ?? null)
        : hasLogError
          ? (latestLog?.error_message ?? null)
          : null;

    // 4. Latest sync timestamp across all tables
    let latestSyncAt: Date | null = null;
    for (const row of metaRows) {
      if (row.last_sync_at) {
        const d = new Date(row.last_sync_at);
        if (!latestSyncAt || d.getTime() > latestSyncAt.getTime()) {
          latestSyncAt = d;
        }
      }
    }

    if (!latestSyncAt) {
      return {
        status: 'unavailable',
        lastSyncAt: null,
        lastSyncAtWIB: null,
        rowsSyncedLastRun: latestLog ? Number(latestLog.rows_synced) : null,
        errorMessage: 'Belum ada sinkronisasi',
      };
    }

    // 5. Overall status
    const overallStatus: SyncStatus =
      hasMetaError || hasLogError
        ? 'error'
        : isStale(latestSyncAt)
          ? 'stale'
          : 'healthy';

    // 6. Per-table breakdown
    const metaMap = new Map(metaRows.map((r) => [r.table_name, r]));
    const tableStatuses: TableSyncStatus[] = [];

    for (const [logicalName, physicalTables] of Object.entries(TABLE_GROUPS)) {
      let groupLatestSync: Date | null = null;
      let groupHasError = false;
      let groupRowsSynced: number | null = null;

      for (const pt of physicalTables) {
        const row = metaMap.get(pt);
        if (!row) continue;

        if (row.last_sync_at) {
          const d = new Date(row.last_sync_at);
          if (!groupLatestSync || d.getTime() > groupLatestSync.getTime()) {
            groupLatestSync = d;
          }
        }

        if (row.sync_status === 'error' || (row.error_message?.length ?? 0) > 0) {
          groupHasError = true;
        }
      }

      const tableStatus: SyncStatus = !groupLatestSync
        ? 'unavailable'
        : groupHasError
          ? 'error'
          : isStale(groupLatestSync)
            ? 'stale'
            : 'healthy';

      tableStatuses.push({
        tableName: logicalName,
        status: tableStatus,
        lastSyncAt: groupLatestSync,
        rowsSynced: groupRowsSynced,
      });
    }

    return {
      status: overallStatus,
      lastSyncAt: latestSyncAt,
      lastSyncAtWIB: formatWIB(latestSyncAt),
      rowsSyncedLastRun: latestLog ? Number(latestLog.rows_synced) : null,
      errorMessage,
      tableStatuses,
    };
  } catch (err) {
    console.error('[sync-freshness] Error querying sync status:', err);
    return emptyResult('Gagal mengambil status sinkronisasi');
  }
}

function emptyResult(msg: string): SyncFreshnessResult {
  return {
    status: 'unavailable',
    lastSyncAt: null,
    lastSyncAtWIB: null,
    rowsSyncedLastRun: null,
    errorMessage: msg,
  };
}

/**
 * Quick single-table freshness probe for a mirrored table.
 * True when sync_metadata.last_sync_at for `tableName` is within
 * STALE_THRESHOLD_MS (10 min). Used by analytics-first page reads to decide
 * whether the mirror is fresh enough to serve current-period queries.
 * ponytail: per-table thresholds via sync_metadata config columns.
 */
export async function isAnalyticsTableFresh(tableName: string): Promise<boolean> {
  try {
    const rows = await queryAnalytics<{ last_sync_at: string | null }>(
      `SELECT last_sync_at FROM sync_metadata WHERE table_name = $1`,
      [tableName]
    );
    const ts = rows[0]?.last_sync_at;
    if (!ts) return false;
    return Date.now() - new Date(ts).getTime() <= STALE_THRESHOLD_MS;
  } catch (err) {
    console.warn(`[sync-freshness] Freshness probe failed for ${tableName}:`, err);
    return false;
  }
}
