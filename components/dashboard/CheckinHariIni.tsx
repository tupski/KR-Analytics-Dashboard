'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import { CheckinItem } from '@/types';

interface CheckinHariIniProps {
    items: CheckinItem[];
    isLoading?: boolean;
}

/**
 * CheckinHariIni Component
 * 
 * Displays today's check-in list with location, room number, customer name, and time.
 * Shows maximum 5 items with a "Lihat Semua" link to view all check-ins.
 * 
 */
export default function CheckinHariIni({ items, isLoading = false }: CheckinHariIniProps) {
    // Show skeleton loader when loading
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Check-in Hari Ini</h2>
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                            <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse flex-shrink-0"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                            </div>
                            <div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Show empty state when no check-ins exist
    if (!items || items.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Check-in Hari Ini</h2>
                </div>
                <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
                        <ArrowDown className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-sm">Tidak ada check-in hari ini</p>
                </div>
            </div>
        );
    }

    // Display maximum 5 items
    const displayItems = items.slice(0, 5);
    const hasMore = items.length > 5;

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Check-in Hari Ini</h2>
                <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    {items.length} {items.length === 1 ? 'tamu' : 'tamu'}
                </span>
            </div>

            {/* Check-in List */}
            <div className="space-y-3">
                {displayItems.map((item, index) => (
                    <div
                        key={item.id}
                        className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0"
                    >
                        {/* Check-in Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                            <ArrowDown className="w-4 h-4 text-green-600" />
                        </div>

                        {/* Check-in Details */}
                        <div className="flex-1 min-w-0">
                            {/* Location and Room Number */}
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                    {item.apartmentLocation}
                                </span>
                                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                    {item.roomNumber}
                                </span>
                            </div>

                            {/* Customer Name */}
                            <p className="text-sm text-gray-600 truncate">{item.customerName}</p>
                        </div>

                        {/* Time */}
                        <div className="flex-shrink-0 text-right">
                            <span className="text-sm font-medium text-gray-900">{item.time}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* "Lihat Semua" Link */}
            {hasMore && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <Link
                        href="/customer"
                        className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors inline-flex items-center gap-1"
                    >
                        Lihat Semua
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                            />
                        </svg>
                    </Link>
                </div>
            )}

            <p className="mt-3 text-xs text-gray-400 text-center">
                Data: transaksi dengan checkin_at = hari ini (WIB)
            </p>
        </div>
    );
}
