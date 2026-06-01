'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Table, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

// ─── Types ───────────────────────────────────────────────────────

export interface CollapsibleChartTableColumn {
    key: string;
    label: string;
    format?: 'currency' | 'percentage' | 'number' | 'text';
}

export interface CollapsibleChartTableProps {
    title: string;
    columns: CollapsibleChartTableColumn[];
    rows: Record<string, any>[];
    defaultCollapsed?: boolean;
    emptyMessage?: string;
    exportable?: boolean;
    maxHeight?: string;
}

// ─── Value formatter ─────────────────────────────────────────────

function formatCellValue(value: any, format?: 'currency' | 'percentage' | 'number' | 'text'): string {
    if (value === null || value === undefined) return '—';

    switch (format) {
        case 'currency':
            return formatCurrency(Number(value));
        case 'percentage':
            return `${Number(value).toFixed(1)}%`;
        case 'number':
            return Number(value).toLocaleString('id-ID');
        case 'text':
        default:
            return String(value);
    }
}

// ─── CSV Export helper ──────────────────────────────────────────

function exportCSV(
    title: string,
    columns: CollapsibleChartTableColumn[],
    rows: Record<string, any>[],
) {
    const header = columns.map(c => c.label).join(',');
    const dataLines = rows.map(row =>
        columns.map(c => {
            const raw = row[c.key];
            const val = typeof raw === 'string' && raw.includes(',') ? `"${raw}"` : String(raw ?? '');
            return val;
        }).join(','),
    );
    const csv = [header, ...dataLines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────

export default function CollapsibleChartTable({
    title,
    columns,
    rows,
    defaultCollapsed = true,
    emptyMessage = 'Tidak ada data untuk ditampilkan.',
    exportable = false,
    maxHeight = '320px',
}: CollapsibleChartTableProps) {
    const [expanded, setExpanded] = useState(!defaultCollapsed);

    return (
        <div className="border-t border-gray-100 pt-2">
            {/* ── Toggle header ── */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                    <Table className="w-3.5 h-3.5" />
                    <span>
                        {expanded ? 'Sembunyikan tabel' : 'Lihat tabel data'}
                    </span>
                    {expanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                    )}
                </button>

                {exportable && rows.length > 0 && (
                    <button
                        onClick={() => exportCSV(title, columns, rows)}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
                        title="Export CSV"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Export</span>
                    </button>
                )}
            </div>

            {/* ── Table ── */}
            {expanded && (
                <div
                    className="mt-2 overflow-x-auto overflow-y-auto rounded-lg border border-gray-200"
                    style={{ maxHeight }}
                >
                    {rows.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                            {emptyMessage}
                        </div>
                    ) : (
                        <table className="w-full text-xs">
                            {/* Header */}
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    {columns.map(col => (
                                        <th
                                            key={col.key}
                                            className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
                                        >
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            {/* Body */}
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((row, i) => (
                                    <tr
                                        key={i}
                                        className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                                    >
                                        {columns.map(col => (
                                            <td
                                                key={col.key}
                                                className="px-3 py-2 text-gray-700 whitespace-nowrap"
                                            >
                                                {formatCellValue(row[col.key], col.format)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
