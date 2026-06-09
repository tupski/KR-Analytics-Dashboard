'use client';

import React, { useEffect, useCallback } from 'react';
import { X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';
import type { KpiLocationBreakdown } from '@/types/dashboard';

// ─── Types ───────────────────────────────────────────────────────

export type KpiModalVariant =
    | 'revenue'
    | 'booking'
    | 'occupancy'
    | 'available';

export interface RevenueDetailData {
    totalRevenue: number;
    cashAmount: number;
    transferAmount: number;
    transactionCount: number;
}

export interface BookingDetailData {
    bookingCount: number;
    checkinToday: number;
    checkoutToday: number;
}

export interface OccupancyDetailData {
    occupancyRate: number;
    totalUnits: number;
    occupiedUnits: number;
    locationBreakdown: KpiLocationBreakdown[];
}

export interface AvailableDetailData {
    availableUnits: number;
    occupiedUnits: number;
    totalUnits: number;
}

export interface KpiDetailModalProps {
    variant: KpiModalVariant;
    title: string;
    isOpen: boolean;
    onClose: () => void;
    data: RevenueDetailData | BookingDetailData | OccupancyDetailData | AvailableDetailData;
}

// ─── CTA config per variant ──────────────────────────────────────

const CTA_CONFIG: Record<KpiModalVariant, { label: string; href: string }> = {
    revenue: { label: 'Lihat Laporan Keuangan', href: '/laporan' },
    booking: { label: 'Lihat Semua Booking', href: '/booking' },
    occupancy: { label: 'Lihat Detail Unit', href: '/unit' },
    available: { label: 'Lihat Ketersediaan Unit', href: '/unit' },
};

// ─── Variant detail renderers ────────────────────────────────────

function RevenueDetail({ data }: { data: RevenueDetailData }) {
    const cashPct = data.totalRevenue > 0
        ? ((data.cashAmount / data.totalRevenue) * 100).toFixed(1)
        : '0';
    const transferPct = data.totalRevenue > 0
        ? ((data.transferAmount / data.totalRevenue) * 100).toFixed(1)
        : '0';

    return (
        <div className="space-y-4">
            {/* Total revenue */}
            <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-1">Total Pendapatan</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.totalRevenue)}</p>
                <p className="text-sm text-gray-400 mt-1">{data.transactionCount} transaksi</p>
            </div>

            {/* Breakdown */}
            <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                        <p className="text-sm font-medium text-green-800">Tunai</p>
                        <p className="text-xs text-green-600">{cashPct}% dari total</p>
                    </div>
                    <p className="text-sm font-semibold text-green-900">{formatCurrency(data.cashAmount)}</p>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div>
                        <p className="text-sm font-medium text-blue-800">Transfer</p>
                        <p className="text-xs text-blue-600">{transferPct}% dari total</p>
                    </div>
                    <p className="text-sm font-semibold text-blue-900">{formatCurrency(data.transferAmount)}</p>
                </div>
            </div>

            {/* Summary row */}
            <div className="border-t pt-3 flex justify-between text-sm">
                <span className="text-gray-500">Rata-rata per transaksi</span>
                <span className="font-medium text-gray-900">
                    {data.transactionCount > 0
                        ? formatCurrency(data.totalRevenue / data.transactionCount)
                        : '—'}
                </span>
            </div>
        </div>
    );
}

function BookingDetail({ data }: { data: BookingDetailData }) {
    return (
        <div className="space-y-4">
            <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-1">Total Booking</p>
                <p className="text-3xl font-bold text-gray-900">{data.bookingCount}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-purple-700">{data.checkinToday}</p>
                    <p className="text-xs text-purple-600 mt-1">Check-in Hari Ini</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">{data.checkoutToday}</p>
                    <p className="text-xs text-orange-600 mt-1">Check-out Hari Ini</p>
                </div>
            </div>
        </div>
    );
}

function OccupancyDetail({ data }: { data: OccupancyDetailData }) {
    return (
        <div className="space-y-4">
            {/* Overall occupancy */}
            <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-1">Tingkat Hunian</p>
                <p className="text-3xl font-bold text-gray-900">{data.occupancyRate.toFixed(1)}%</p>
                <p className="text-sm text-gray-400 mt-1">
                    {data.occupiedUnits} dari {data.totalUnits} unit terisi
                </p>
            </div>

            {/* Location breakdown */}
            {data.locationBreakdown.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Per Lokasi
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {data.locationBreakdown.map((loc) => {
                            const barWidth = data.totalUnits > 0
                                ? (loc.occupiedUnits / loc.totalUnits) * 100
                                : 0;
                            return (
                                <div key={loc.location} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-600 truncate max-w-[60%]" title={loc.location}>
                                            {loc.location}
                                        </span>
                                        <span className="font-medium text-gray-800">
                                            {loc.occupiedUnits}/{loc.totalUnits}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${loc.occupancyRate >= 80
                                                    ? 'bg-green-500'
                                                    : loc.occupancyRate >= 50
                                                        ? 'bg-yellow-500'
                                                        : 'bg-red-400'
                                                }`}
                                            style={{ width: `${Math.max(barWidth, 2)}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function AvailableDetail({ data }: { data: AvailableDetailData }) {
    const pctAvailable = data.totalUnits > 0
        ? ((data.availableUnits / data.totalUnits) * 100).toFixed(1)
        : '0';
    const pctOccupied = data.totalUnits > 0
        ? ((data.occupiedUnits / data.totalUnits) * 100).toFixed(1)
        : '0';

    return (
        <div className="space-y-4">
            <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-1">Unit Tersedia</p>
                <p className="text-3xl font-bold text-green-600">{data.availableUnits}</p>
                <p className="text-sm text-gray-400 mt-1">dari {data.totalUnits} total unit</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{data.availableUnits}</p>
                    <p className="text-xs text-green-600 mt-1">Tersedia ({pctAvailable}%)</p>
                </div>
                <div className="p-3 bg-gray-100 rounded-lg text-center">
                    <p className="text-2xl font-bold text-gray-700">{data.occupiedUnits}</p>
                    <p className="text-xs text-gray-600 mt-1">Ditempati ({pctOccupied}%)</p>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────

export default function KpiDetailModal({
    variant,
    title,
    isOpen,
    onClose,
    data,
}: KpiDetailModalProps) {
    // Close on Escape
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const cta = CTA_CONFIG[variant];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/40 transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal panel */}
            <div
                className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col"
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Tutup"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="px-5 py-4 overflow-y-auto flex-1">
                    {variant === 'revenue' && <RevenueDetail data={data as RevenueDetailData} />}
                    {variant === 'booking' && <BookingDetail data={data as BookingDetailData} />}
                    {variant === 'occupancy' && <OccupancyDetail data={data as OccupancyDetailData} />}
                    {variant === 'available' && <AvailableDetail data={data as AvailableDetailData} />}
                </div>

                {/* CTA footer */}
                <div className="px-5 pb-5 pt-2">
                    <Link
                        href={cta.href}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                        <ExternalLink className="w-4 h-4" />
                        {cta.label}
                    </Link>
                </div>
            </div>
        </div>
    );
}
