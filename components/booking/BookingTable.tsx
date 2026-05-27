'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BookingItem } from '@/app/(dashboard)/booking/actions';
import { formatDuration } from '@/lib/utils/formatDuration';

interface BookingTableProps {
    items: BookingItem[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export default function BookingTable({
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
}: BookingTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    };

    const goToPage = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`/booking?${params.toString()}`);
    };

    if (items.length === 0) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center shadow-sm">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                    <Clock className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">Tidak ada booking</h3>
                <p className="text-gray-500 text-sm">Tidak ditemukan data booking dengan filter yang dipilih.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Table Header Info */}
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200 flex items-center justify-between">
                <p className="text-xs sm:text-sm text-gray-600">
                    Menampilkan <span className="font-medium">{(page - 1) * pageSize + 1}</span>-
                    <span className="font-medium">{Math.min(page * pageSize, totalCount)}</span> dari{' '}
                    <span className="font-medium">{totalCount.toLocaleString('id-ID')}</span> booking
                </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Tamu</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Lokasi & Kamar</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Check-in</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Check-out</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Durasi</th>
                            <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Marketing</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {items.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3">
                                    <p className="font-medium text-gray-900">{item.customerName}</p>
                                    <p className="text-xs text-gray-500">{item.shift || '-'}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span className="text-gray-900">{item.apartmentLocation}</span>
                                    </div>
                                    <span className="inline-block mt-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                        {item.roomNumber}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                    {formatDate(item.checkinAt)}
                                </td>
                                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                    {formatDate(item.checkoutAt)}
                                </td>
                                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                    {formatDuration(item.rentalDuration)}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                                    {formatCurrency(item.totalAmount)}
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                    {item.marketingName || '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="px-3 sm:px-4 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
                    <button
                        onClick={() => goToPage(page - 1)}
                        disabled={page <= 1}
                        className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">Sebelumnya</span>
                    </button>

                    <div className="flex items-center gap-0.5 sm:gap-1 order-last sm:order-none w-full sm:w-auto justify-center">
                        {generatePageNumbers(page, totalPages).map((p, idx) => (
                            p === '...' ? (
                                <span key={`ellipsis-${idx}`} className="px-1.5 sm:px-2 py-1 text-gray-400 text-xs sm:text-sm">...</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => goToPage(Number(p))}
                                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${Number(p) === page
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-700 hover:bg-gray-100'
                                        }`}
                                >
                                    {p}
                                </button>
                            )
                        ))}
                    </div>

                    <button
                        onClick={() => goToPage(page + 1)}
                        disabled={page >= totalPages}
                        className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <span className="hidden sm:inline">Selanjutnya</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

function generatePageNumbers(current: number, total: number): (string | number)[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: (string | number)[] = [];

    if (current <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', total);
    } else if (current >= total - 3) {
        pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
    } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }

    return pages;
}
