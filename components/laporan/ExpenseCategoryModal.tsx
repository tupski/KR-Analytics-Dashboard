'use client';

import { useEffect, useState } from 'react';
import { X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
    fetchExpenseDetailsByCategory,
    type DateFilter,
    type ExpenseDetail,
    type ExpenseSortKey,
    type SortDirection,
} from '@/app/(dashboard)/laporan/actions';
import { formatCurrency } from '@/lib/utils/format';

interface Props {
    category: string;
    filter: DateFilter;
    onClose: () => void;
}

const formatDate = (d: string) => {
    try {
        return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return d;
    }
};

const COLUMNS: { key: ExpenseSortKey; label: string; align?: 'left' | 'right' }[] = [
    { key: 'tanggal', label: 'Tanggal' },
    { key: 'nama_pengeluaran', label: 'Nama' },
    { key: 'apartment_location', label: 'Lokasi' },
    { key: 'jumlah', label: 'Jumlah', align: 'right' },
];

export default function ExpenseCategoryModal({ category, filter, onClose }: Props) {
    const [rows, setRows] = useState<ExpenseDetail[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sortKey, setSortKey] = useState<ExpenseSortKey>('tanggal');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchExpenseDetailsByCategory(category, filter, page, pageSize, sortKey, sortDir)
            .then(res => {
                if (cancelled) return;
                setRows(res.rows);
                setTotal(res.total);
            })
            .catch(err => {
                if (cancelled) return;
                console.error(err);
                setError('Gagal memuat data pengeluaran.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [category, filter, page, pageSize, sortKey, sortDir]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const toggleSort = (key: ExpenseSortKey) => {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'jumlah' || key === 'tanggal' ? 'desc' : 'asc');
        }
        setPage(1);
    };

    const totalPageJumlah = rows.reduce((s, r) => s + r.jumlah, 0);

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/50"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between bg-slate-50">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500 uppercase">Detail Pengeluaran</p>
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{category}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg flex-shrink-0" aria-label="Tutup">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                            <span className="ml-2 text-sm text-gray-500">Memuat...</span>
                        </div>
                    ) : error ? (
                        <p className="text-center text-red-600 py-12">{error}</p>
                    ) : rows.length === 0 ? (
                        <p className="text-center text-gray-500 py-12">Tidak ada data pengeluaran untuk kategori ini.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    {COLUMNS.map(col => (
                                        <th
                                            key={col.key}
                                            onClick={() => toggleSort(col.key)}
                                            className={`px-4 py-2.5 font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {col.label}
                                                {sortKey === col.key && (
                                                    sortDir === 'asc'
                                                        ? <ChevronUp className="w-3.5 h-3.5" />
                                                        : <ChevronDown className="w-3.5 h-3.5" />
                                                )}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.id} className="border-t border-gray-100 hover:bg-blue-50/40">
                                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{formatDate(r.tanggal)}</td>
                                        <td className="px-4 py-2.5 text-gray-900">
                                            <div>{r.namaPengeluaran}</div>
                                            {r.keterangan && <div className="text-xs text-gray-500 mt-0.5">{r.keterangan}</div>}
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-600">
                                            {r.apartmentLocation || <span className="text-gray-400">—</span>}
                                            {r.roomNumber && <span className="text-xs text-gray-400"> · {r.roomNumber}</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-semibold text-red-700 whitespace-nowrap">{formatCurrency(r.jumlah)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {rows.length > 0 && (
                                <tfoot>
                                    <tr className="border-t-2 border-gray-200 bg-slate-50">
                                        <td colSpan={3} className="px-4 py-2.5 text-right text-xs text-gray-500 uppercase font-semibold">Subtotal halaman</td>
                                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">{formatCurrency(totalPageJumlah)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    )}
                </div>

                {/* Footer / pagination */}
                {!loading && !error && total > 0 && (
                    <div className="px-5 py-3 border-t border-gray-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                            <span>{total} record total</span>
                            <label className="flex items-center gap-1">
                                Per halaman:
                                <select
                                    value={pageSize}
                                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                    className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                                >
                                    {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                                aria-label="Halaman sebelumnya"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-gray-600 px-2">
                                Halaman <strong>{page}</strong> / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                                aria-label="Halaman berikutnya"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
