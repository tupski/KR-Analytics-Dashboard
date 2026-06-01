'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import type { UnitPerformanceData } from '@/lib/dashboard/unit-performance';
import {
    IDLE_SEVERITY_LABELS,
    IDLE_SEVERITY_STYLES,
} from '@/lib/dashboard/unit-performance';

interface UnitPerformancePanelProps {
    data: UnitPerformanceData | null;
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
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg" />
            ))}
        </div>
    );
}

// ─── Idle Unit Card (mobile) ──────────────────────────────────

function IdleUnitCard({ item }: { item: UnitPerformanceData['idleUnits'][0] }) {
    const style = IDLE_SEVERITY_STYLES[item.severity];
    return (
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <Link
                    href={`/unit?filter=today&location=${encodeURIComponent(item.location)}`}
                    className="font-semibold text-sm text-gray-900 hover:text-blue-600 transition-colors"
                >
                    {item.unitCode}
                </Link>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${style.badge}`}>
                    {IDLE_SEVERITY_LABELS[item.severity]}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-gray-600">
                <div><span className="text-gray-400">Lokasi: </span>{item.location}</div>
                <div><span className="text-gray-400">Idle: </span><span className="font-semibold">{item.idleDays} hari</span></div>
                <div><span className="text-gray-400">Status: </span>{item.currentStatus}</div>
                <div><span className="text-gray-400">Bulan ini: </span>{fmtIdr(item.monthRevenue)}</div>
            </div>
        </div>
    );
}

// ─── Performance Card (mobile) ────────────────────────────────

function PerfCard({
    item,
    rank,
    type,
}: {
    item: UnitPerformanceData['topUnits'][0];
    rank: number;
    type: 'top' | 'bottom';
}) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${type === 'top' ? 'bg-green-500' : 'bg-red-400'}`}>
                        {rank}
                    </span>
                    <Link
                        href={`/unit?filter=today&location=${encodeURIComponent(item.location)}`}
                        className="font-semibold text-sm text-gray-900 hover:text-blue-600 transition-colors truncate"
                    >
                        {item.unitCode}
                    </Link>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-gray-600">
                <div><span className="text-gray-400">Lokasi: </span>{item.location}</div>
                <div><span className="text-gray-400">Revenue: </span><span className="font-semibold">{fmtIdr(item.revenue)}</span></div>
                <div><span className="text-gray-400">Booking: </span>{item.bookingCount}x</div>
                {item.occupancyRate != null && <div><span className="text-gray-400">Okupansi: </span>{item.occupancyRate.toFixed(1)}%</div>}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────

export default function UnitPerformancePanel({ data, isLoading }: UnitPerformancePanelProps) {
    return (
        <section>
            <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-gray-600" />
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    Performa Unit
                </h2>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mb-3">
                Unit idle, unit dengan pendapatan tertinggi dan terendah bulan ini.
            </p>

            {isLoading && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    <SkeletonSection />
                    <SkeletonSection />
                    <SkeletonSection />
                </div>
            )}

            {!isLoading && data && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* ── Idle Units ── */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Clock className="w-4 h-4 text-orange-500" />
                            <h3 className="text-sm font-semibold text-gray-800">Unit Nganggur</h3>
                            <span className="text-xs text-gray-400 ml-auto">
                                {data.idleUnits.length} unit
                            </span>
                        </div>

                        {data.idleUnits.length === 0 ? (
                            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                                <p className="text-xs text-gray-500">Tidak ada unit nganggur (≥3 hari).</p>
                            </div>
                        ) : (
                            <>
                                {/* Desktop table */}
                                <div className="hidden lg:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">Unit</th>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">Lokasi</th>
                                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Idle</th>
                                                <th className="text-center px-3 py-2 font-semibold text-gray-600">Severity</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {data.idleUnits.map((unit) => {
                                                const style = IDLE_SEVERITY_STYLES[unit.severity];
                                                return (
                                                    <tr key={unit.unitId} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-3 py-2">
                                                            <Link
                                                                href={`/unit?filter=today&location=${encodeURIComponent(unit.location)}`}
                                                                className="font-medium text-gray-900 hover:text-blue-600"
                                                            >
                                                                {unit.unitCode}
                                                            </Link>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-600">{unit.location}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">
                                                            {unit.idleDays}h
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${style.badge}`}>
                                                                {IDLE_SEVERITY_LABELS[unit.severity]}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Mobile cards */}
                                <div className="lg:hidden space-y-2">
                                    {data.idleUnits.map((unit) => (
                                        <IdleUnitCard key={unit.unitId} item={unit} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Top Units ── */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            <h3 className="text-sm font-semibold text-gray-800">Top Unit</h3>
                            <span className="text-xs text-gray-400 ml-auto">Pendapatan tertinggi</span>
                        </div>

                        {data.topUnits.length === 0 ? (
                            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                                <p className="text-xs text-gray-500">Belum ada data pendapatan bulan ini.</p>
                            </div>
                        ) : (
                            <>
                                {/* Desktop table */}
                                <div className="hidden lg:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">#</th>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">Unit</th>
                                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Revenue</th>
                                                <th className="text-center px-3 py-2 font-semibold text-gray-600">Booking</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {data.topUnits.map((unit, i) => (
                                                <tr key={unit.unitId} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-3 py-2">
                                                        <span className="w-4 h-4 rounded-full bg-green-100 text-green-700 inline-flex items-center justify-center text-[10px] font-bold">
                                                            {i + 1}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Link
                                                            href={`/unit?filter=today&location=${encodeURIComponent(unit.location)}`}
                                                            className="font-medium text-gray-900 hover:text-blue-600"
                                                        >
                                                            {unit.unitCode}
                                                        </Link>
                                                        <span className="text-gray-400 ml-1">{unit.location}</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">
                                                        {fmtIdr(unit.revenue)}
                                                    </td>
                                                    <td className="px-3 py-2 text-center tabular-nums text-gray-600">
                                                        {unit.bookingCount}x
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Mobile cards */}
                                <div className="lg:hidden space-y-2">
                                    {data.topUnits.map((unit, i) => (
                                        <PerfCard key={unit.unitId} item={unit} rank={i + 1} type="top" />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Bottom Units ── */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <TrendingDown className="w-4 h-4 text-red-400" />
                            <h3 className="text-sm font-semibold text-gray-800">Bottom Unit</h3>
                            <span className="text-xs text-gray-400 ml-auto">Pendapatan terendah</span>
                        </div>

                        {data.bottomUnits.length === 0 ? (
                            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                                <p className="text-xs text-gray-500">Belum ada data pendapatan bulan ini.</p>
                            </div>
                        ) : (
                            <>
                                {/* Desktop table */}
                                <div className="hidden lg:block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">#</th>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-600">Unit</th>
                                                <th className="text-right px-3 py-2 font-semibold text-gray-600">Revenue</th>
                                                <th className="text-center px-3 py-2 font-semibold text-gray-600">Booking</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {data.bottomUnits.map((unit, i) => (
                                                <tr key={unit.unitId} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-3 py-2">
                                                        <span className="w-4 h-4 rounded-full bg-red-100 text-red-600 inline-flex items-center justify-center text-[10px] font-bold">
                                                            {i + 1}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Link
                                                            href={`/unit?filter=today&location=${encodeURIComponent(unit.location)}`}
                                                            className="font-medium text-gray-900 hover:text-blue-600"
                                                        >
                                                            {unit.unitCode}
                                                        </Link>
                                                        <span className="text-gray-400 ml-1">{unit.location}</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">
                                                        {unit.bookingCount === 0 ? (
                                                            <span className="text-gray-400">Belum ada transaksi</span>
                                                        ) : (
                                                            fmtIdr(unit.revenue)
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-center tabular-nums text-gray-600">
                                                        {unit.bookingCount}x
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Mobile cards */}
                                <div className="lg:hidden space-y-2">
                                    {data.bottomUnits.map((unit, i) => (
                                        <PerfCard key={unit.unitId} item={unit} rank={i + 1} type="bottom" />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
