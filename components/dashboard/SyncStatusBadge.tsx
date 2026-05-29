'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import type { SyncFreshnessResult, SyncStatus } from '@/lib/analytics/sync-freshness';
import { getSyncFreshness } from '@/app/(dashboard)/dashboard/actions';

// ─── Styles per status ───

const STATUS_STYLES: Record<SyncStatus, { dot: string; bg: string; text: string; label: string }> = {
  healthy: {
    dot: 'bg-green-500',
    bg: 'bg-green-50 border-green-200',
    text: 'text-green-800',
    label: 'Sehat',
  },
  stale: {
    dot: 'bg-yellow-500',
    bg: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-800',
    label: 'Terlambat',
  },
  error: {
    dot: 'bg-red-500',
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    label: 'Gagal',
  },
  unavailable: {
    dot: 'bg-gray-400',
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-600',
    label: 'Tidak Tersedia',
  },
};

const TABLE_LABELS: Record<string, string> = {
  transactions: 'Transaksi',
  pengeluaran: 'Pengeluaran',
  tagihan_bulanan: 'Tagihan Bulanan',
  tagihan_fee_lunas: 'Fee Lunas',
  master_tables: 'Master Data',
  summary_refresh: 'Ringkasan',
};

// ─── Relative time helper ───

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  return `${Math.floor(diffHr / 24)} hari lalu`;
}

// ─── Dot component ───

function StatusDot({ status }: { status: SyncStatus }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_STYLES[status].dot}`}
    />
  );
}

// ─── SyncStatusBadge ───

export default function SyncStatusBadge() {
  const [data, setData] = useState<SyncFreshnessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const result = await getSyncFreshness();
      setData(result);
    } catch {
      // Server action should never throw, but be safe
      setData({
        status: 'unavailable',
        lastSyncAt: null,
        lastSyncAtWIB: null,
        rowsSyncedLastRun: null,
        errorMessage: 'Gagal memuat status',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 30_000);
    return () => clearInterval(interval);
  }, [fetch]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 animate-pulse">
        <Clock className="w-3.5 h-3.5" />
        <span>Memuat status sinkronisasi...</span>
      </div>
    );
  }

  if (!data) return null;

  const styles = STATUS_STYLES[data.status];
  const showDetail = expanded && data.tableStatuses && data.tableStatuses.length > 0;

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${styles.bg}`}>
      {/* Main row */}
      <div className="flex items-center gap-2">
        <StatusDot status={data.status} />

        <div className="flex-1 min-w-0">
          <p className={`font-medium ${styles.text}`}>
            {data.status === 'unavailable'
              ? 'Status sinkronisasi belum tersedia'
              : 'Data tersinkronisasi'}
          </p>
          {data.lastSyncAtWIB && (
            <p className="text-gray-500 truncate">{data.lastSyncAtWIB}</p>
          )}
        </div>

        {/* Status label */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${styles.bg} ${styles.text} flex-shrink-0`}>
          {styles.label}
        </span>

        {/* Expand toggle */}
        {data.tableStatuses && data.tableStatuses.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label={expanded ? 'Sembunyikan detail' : 'Tampilkan detail'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Per-table detail */}
      {showDetail && (
        <div className="mt-2 pt-2 border-t border-gray-200/60 space-y-1">
          {data.tableStatuses!.map((ts) => {
            const tStyles = STATUS_STYLES[ts.status];
            const label = TABLE_LABELS[ts.tableName] ?? ts.tableName;
            return (
              <div key={ts.tableName} className="flex items-center gap-2 text-gray-600">
                <StatusDot status={ts.status} />
                <span className="flex-1">{label}</span>
                <span className="text-gray-400">
                  {ts.lastSyncAt ? relativeTime(ts.lastSyncAt) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error message */}
      {data.errorMessage && data.status === 'error' && (
        <p className="mt-1 text-red-600 text-[10px] leading-tight">{data.errorMessage}</p>
      )}
    </div>
  );
}
