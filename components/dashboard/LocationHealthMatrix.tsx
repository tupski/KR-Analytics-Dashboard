'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { LocationHealthItem as LocationHealthItemType } from '@/types/dashboard';
import {
    LOCATION_STATUS_LABELS,
    LOCATION_STATUS_STYLES,
} from '@/lib/dashboard/location-health';

interface LocationHealthMatrixProps {
    locations: LocationHealthItemType[];
    isLoading: boolean;
}

/** Format IDR without decimals for display. */
function fmtIdr(n: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n);
}

/** Skeleton rows for loading state. */
function SkeletonRows() {
    return (
        <>
            {[1, 2, 3].map((i) => (
                <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-12 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-24 bg-gray-200 rounded-full" /></td>
                </tr>
            ))}
        </>
    );
}

/** Skeleton cards for mobile loading state. */
function SkeletonCards() {
    return (
        <>
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
                    <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
                    <div className="space-y-2">
                        <div className="h-3 w-full bg-gray-200 rounded" />
                        <div className="h-3 w-3/4 bg-gray-200 rounded" />
                        <div className="h-3 w-1/2 bg-gray-200 rounded" />
                    </div>
                </div>
            ))}
        </>
    );
}

/**
 * LocationHealthMatrix Component
 *
 * Displays "Kesehatan Lokasi" — a per-location performance matrix.
 * Desktop: table. Mobile: stacked cards.
 */
export default function LocationHealthMatrix({ locations, isLoading }: LocationHealthMatrixProps) {
    return (
        <section>
            <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-5 h-5 text-gray-600" />
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                    Kesehatan Lokasi
                </h2>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mb-3">
                Perbandingan okupansi dan pendapatan per lokasi berdasarkan periode aktif.
            </p>

            {/* Empty state */}
            {!isLoading && locations.length === 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                    <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                        Belum ada data lokasi yang bisa dianalisis.
                    </p>
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <>
                    {/* Desktop skeleton table */}
                    <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Lokasi</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Okupansi</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Unit</th>
                                    <th className="text-right px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Pendapatan</th>
                                    <th className="text-right px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Rev/Unit</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <SkeletonRows />
                            </tbody>
                        </table>
                    </div>
                    {/* Mobile skeleton cards */}
                    <div className="sm:hidden grid grid-cols-1 gap-3">
                        <SkeletonCards />
                    </div>
                </>
            )}

            {/* Data state */}
            {!isLoading && locations.length > 0 && (
                <>
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Lokasi</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Okupansi</th>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Unit (terisi/tersedia)</th>
                                    <th className="text-right px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Pendapatan</th>
                                    <th className="text-right px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Rev/Unit</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-700 text-xs uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {locations.map((loc) => {
                                    const statusStyle = LOCATION_STATUS_STYLES[loc.status];
                                    return (
                                        <tr key={loc.location} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={`/unit?location=${encodeURIComponent(loc.location)}`}
                                                    className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                                                >
                                                    {loc.location}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 sm:w-20 h-1.5 bg-gray-100 rounded-full">
                                                        <div
                                                            className={`h-1.5 rounded-full ${loc.occupancyRate >= 80 ? 'bg-green-500' : loc.occupancyRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                            style={{ width: `${Math.min(loc.occupancyRate, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-700 tabular-nums">
                                                        {loc.occupancyRate.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">
                                                {loc.occupiedUnits}
                                                <span className="text-gray-400">/</span>
                                                {loc.availableUnits}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-gray-800 tabular-nums font-medium">
                                                {fmtIdr(loc.revenue)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                                                {fmtIdr(loc.revenuePerUnit)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle.badge}`}>
                                                    {LOCATION_STATUS_LABELS[loc.status]}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden grid grid-cols-1 gap-3">
                        {locations.map((loc) => {
                            const statusStyle = LOCATION_STATUS_STYLES[loc.status];
                            return (
                                <div
                                    key={loc.location}
                                    className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
                                >
                                    {/* Header with location name and status badge */}
                                    <div className="flex items-center justify-between mb-3 gap-2">
                                        <Link
                                            href={`/unit?location=${encodeURIComponent(loc.location)}`}
                                            className="font-semibold text-gray-900 text-sm hover:text-blue-600 transition-colors truncate"
                                        >
                                            {loc.location}
                                        </Link>
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${statusStyle.badge}`}>
                                            {LOCATION_STATUS_LABELS[loc.status]}
                                        </span>
                                    </div>

                                    {/* Occupancy bar */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                                            <div
                                                className={`h-1.5 rounded-full ${loc.occupancyRate >= 80 ? 'bg-green-500' : loc.occupancyRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                style={{ width: `${Math.min(loc.occupancyRate, 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-medium text-gray-700 tabular-nums">
                                            {loc.occupancyRate.toFixed(1)}%
                                        </span>
                                    </div>

                                    {/* Detail rows */}
                                    <div className="grid grid-cols-2 gap-y-1.5 text-xs text-gray-600">
                                        <div>
                                            <span className="text-gray-400">Terisi: </span>
                                            <span className="tabular-nums font-medium">{loc.occupiedUnits}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400">Tersedia: </span>
                                            <span className="tabular-nums font-medium">{loc.availableUnits}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400">Pendapatan: </span>
                                            <span className="tabular-nums font-medium">{fmtIdr(loc.revenue)}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400">Rev/Unit: </span>
                                            <span className="tabular-nums font-medium">{fmtIdr(loc.revenuePerUnit)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
}
