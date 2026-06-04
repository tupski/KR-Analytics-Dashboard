'use client';

import React, { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { CheckinItem } from '@/types/dashboard';
import { useAppSettings } from '@/lib/contexts/AppSettingsContext';
import { REPORT_PERIOD_DESCRIPTIONS } from '@/lib/reporting-period';
import type { ReportPeriodMode } from '@/lib/reporting-period';
import RoomDetailModal from '@/components/shared/RoomDetailModal';
import type { DateFilter } from '@/app/(dashboard)/laporan/actions';

interface CheckinHariIniProps {
    items: CheckinItem[];
    isLoading?: boolean;
}

/**
 * Baru Check-in Hari Ini — Clickable rows with transaction detail modal.
 */
export default function CheckinHariIni({ items, isLoading = false }: CheckinHariIniProps) {
    const { settings } = useAppSettings();
    const periodMode: ReportPeriodMode = (settings?.report_period_mode as ReportPeriodMode) || 'calendar_day';
    const periodDesc = REPORT_PERIOD_DESCRIPTIONS[periodMode];
    const [selectedTx, setSelectedTx] = useState<CheckinItem | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    const handleRowClick = (item: CheckinItem) => {
        setSelectedTx(item);
        setModalOpen(true);
    };

    // Show skeleton loader when loading
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Baru Check-in Hari Ini</h2>
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

    // Show empty state
    if (!items || items.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Baru Check-in Hari Ini</h2>
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

    // Sort by newest check-in first
    const sorted = [...items].sort((a, b) => new Date(b.checkinAt).getTime() - new Date(a.checkinAt).getTime());
    const displayItems = sorted.slice(0, 5);
    const hasMore = items.length > 5;

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Baru Check-in Hari Ini</h2>
                <span className="text-xs sm:text-sm font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    {items.length} {items.length === 1 ? 'tamu' : 'tamu'}
                </span>
            </div>

            {/* Check-in List */}
            <div className="space-y-3">
                {displayItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleRowClick(item)}
                        className="w-full flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 text-left hover:bg-blue-50/50 rounded-lg p-1 -mx-1 transition-colors cursor-pointer"
                    >
                        {/* Check-in Icon */}
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                            <ArrowDown className="w-4 h-4 text-green-600" />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                    {item.apartmentLocation}
                                </span>
                                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                    {item.roomNumber}
                                </span>
                            </div>
                            <p className="text-sm text-gray-600 truncate">{item.customerName}</p>
                        </div>

                        {/* Time */}
                        <div className="flex-shrink-0 text-right">
                            <span className="text-sm font-medium text-gray-900">{item.time}</span>
                        </div>
                    </button>
                ))}
            </div>

            {hasMore && (
                <p className="mt-3 text-xs text-gray-400 text-center">
                    +{items.length - 5} check-in lainnya
                </p>
            )}

            <p className="mt-3 text-xs text-gray-400 text-center">
                Periode {periodMode === 'hotel_day' ? 'hotel' : 'harian'}: {periodDesc}
            </p>

            {/* Transaction Detail Modal */}
            {modalOpen && selectedTx && (
                <RoomDetailModal
                    location={selectedTx.apartmentLocation}
                    room={selectedTx.roomNumber}
                    filter={'today' as DateFilter}
                    onClose={() => setModalOpen(false)}
                />
            )}
        </div>
    );
}
