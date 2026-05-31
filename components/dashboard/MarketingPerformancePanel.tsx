'use client';

import React, { useState } from 'react';
import { BarChart3, ChevronRight, TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';
import type { MarketingPerformanceItem } from '@/types/dashboard';
import {
    MARKETING_STATUS_LABELS,
    MARKETING_STATUS_STYLES,
    generateMarketingInsights,
} from '@/lib/dashboard/marketing-performance';

interface MarketingPerformancePanelProps {
    items: MarketingPerformanceItem[];
    totalRevenue: number;
    totalTransactions: number;
    activeChannels: number;
    isLoading: boolean;
}

/** Format IDR without decimals. */
function fmtIdr(n: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n);
}

// ─── Skeleton ─────────────────────────────────────────────────

function SkeletonSection() {
    return (
        <div className="animate-pulse space-y-3">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-gray-100 rounded-lg" />
                ))}
            </div>
            <div className="h-48 bg-gray-100 rounded-lg" />
            <div className="h-12 bg-gray-100 rounded-lg" />
        </div>
    );
}

// ─── Status Badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: MarketingPerformanceItem['status'] }) {
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${MARKETING_STATUS_STYLES[status]}`}>
            {MARKETING_STATUS_LABELS[status]}
        </span>
    );
}

// ─── Channel Card (mobile) ────────────────────────────────────

function ChannelCard({ item }: { item: MarketingPerformanceItem }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-sm text-gray-900 truncate max-w-[60%]">
                    {item.channel}
                </span>
                <StatusBadge status={item.status} />
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-gray-600">
                <div><span className="text-gray-400">Transaksi: </span>{item.transactionCount}x</div>
                <div><span className="text-gray-400">Revenue: </span><span className="font-semibold">{fmtIdr(item.totalRevenue)}</span></div>
                <div><span className="text-gray-400">Rata-rata: </span>{fmtIdr(item.averageTransaction)}</div>
                <div><span className="text-gray-400">Kontribusi: </span>{item.percentageOfRevenue.toFixed(1)}%</div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────

export default function MarketingPerformancePanel({
    items,
    totalRevenue,
    totalTransactions,
    activeChannels,
    isLoading,
    maxRows,
}: MarketingPerformancePanelProps & { maxRows?: number }) {
    // ── Derived data ─────────────────────────────────────────
    const [showAll, setShowAll] = useState(false);
    const sorted = [...items].sort((a, b) => b.totalRevenue - a.totalRevenue);
    const displayItems = maxRows && !showAll ? sorted.slice(0, maxRows) : sorted;
    const hasMore = maxRows ? sorted.length > maxRows : false;
    const strongest = sorted.find(i => i.channel !== 'Tidak Diketahui' && i.transactionCount > 0);
    const weakest = [...sorted]
        .reverse()
        .find(i => i.channel !== 'Tidak Diketahui' && i.transactionCount > 0);

    // ── Insights ─────────────────────────────────────────────
    const insights = React.useMemo(() => generateMarketingInsights(items), [items]);

    return (
        <section>
            <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-5 h-5 text-gray-600" />
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    Performa Marketing
                </h2>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mb-3">
                Performa channel marketing / sumber booking periode ini.
            </p>

            {isLoading && <SkeletonSection />}

            {!isLoading && (
                <>
                    {/* ── Empty State ────────────────────────────── */}
                    {items.length === 0 && (
                        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                            <HelpCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Belum ada data marketing pada periode ini.</p>
                            <p className="text-xs text-gray-400 mt-1">
                                Data akan muncul setelah ada transaksi dengan check-in pada periode ini.
                            </p>
                        </div>
                    )}

                    {items.length > 0 && (
                        <>
                            {/* ── A. Ringkasan Marketing ──────────────── */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                                <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                                    <p className="text-xs text-gray-500">Total Marketing Aktif</p>
                                    <p className="text-lg font-bold text-gray-900">{activeChannels}</p>
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                                    <p className="text-xs text-gray-500">Marketing Terkuat</p>
                                    <p className="text-sm font-semibold text-green-700 truncate">
                                        {strongest ? strongest.channel : '-'}
                                    </p>
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                                    <p className="text-xs text-gray-500">Revenue Terbesar</p>
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                        {strongest ? fmtIdr(strongest.totalRevenue) : '-'}
                                    </p>
                                </div>
                                <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                                    <p className="text-xs text-gray-500">Marketing Terlemah</p>
                                    <p className="text-sm font-semibold text-amber-700 truncate">
                                        {weakest ? weakest.channel : '-'}
                                    </p>
                                </div>
                            </div>

                            {/* ── B. Ranking Marketing ─────────────────── */}
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                                    Ranking Marketing
                                </h3>

                                {/* Desktop table */}
                                <div className="hidden lg:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">#</th>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">Marketing</th>
                                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Transaksi</th>
                                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Revenue</th>
                                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Rata-rata</th>
                                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Kontribusi</th>
                                                <th className="text-center px-3 py-2 font-semibold text-gray-600">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {displayItems.map((item, i) => (
                                                <tr key={item.channel} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                                                    <td className="px-3 py-2 font-medium text-gray-900 max-w-[180px] truncate">
                                                        {item.channel}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{item.transactionCount}x</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">
                                                        {fmtIdr(item.totalRevenue)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                                        {fmtIdr(item.averageTransaction)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                                                        {item.percentageOfRevenue.toFixed(1)}%
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <StatusBadge status={item.status} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile cards */}
                                <div className="lg:hidden space-y-2">
                                    {displayItems.map((item) => (
                                        <ChannelCard key={item.channel} item={item} />
                                    ))}
                                </div>
                            </div>

                            {/* ── C. Insight Ringkas ─────────────────── */}
                            {insights.length > 0 && (
                                <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                                    <h3 className="text-xs font-semibold text-gray-700 mb-1.5">Insight Ringkas</h3>
                                    <ul className="space-y-1">
                                        {insights.map((insight, i) => (
                                            <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                                                <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                                                <span>{insight}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* ── All-unknown state ──────────────────── */}
                            {items.length > 0 && activeChannels === 0 && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mt-3">
                                    <div className="flex items-start gap-2">
                                        <HelpCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-amber-800">
                                                Sebagian besar transaksi belum memiliki sumber marketing.
                                            </p>
                                            <p className="text-xs text-amber-700 mt-1">
                                                Pertimbangkan menambahkan input marketing pada transaksi berikutnya.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Footer: Lihat Semua button */}
                            {hasMore && !showAll && (
                                <div className="flex justify-center pt-2">
                                    <button
                                        onClick={() => setShowAll(true)}
                                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50"
                                    >
                                        Lihat Semua Channel
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                            {showAll && hasMore && (
                                <div className="flex justify-center pt-2">
                                    <button
                                        onClick={() => setShowAll(false)}
                                        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-50"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                        Sembunyikan
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
