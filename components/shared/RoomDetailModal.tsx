'use client';

import { useEffect, useState } from 'react';
import { X, Clock, User, Loader2 } from 'lucide-react';
import { formatDuration } from '@/lib/utils/formatDuration';
import { formatCurrency } from '@/lib/utils/format';

// ─── Types ───────────────────────────────────────────────────────

export type DetailMode = 'active_or_period' | 'last_checkins';

export interface UnitRoomDetailData {
    id: string | number;
    created_at: string;
    checkin_at: string | null;
    checkout_at: string | null;
    rental_duration: number | null;
    customer_name: string | null;
    apartment_location?: string;
    room_number?: string;
    status?: string | null;
}

interface Props {
    location: string;
    room: string;
    isOccupied: boolean;
    mode: DetailMode;
    periodStart?: string;
    periodEnd?: string;
    onClose: () => void;
    /** Guest name from the unit card — used for fallback display when
     *  the unit is occupied but no exact checkin-date match exists
     *  (active stay carried over from previous period). */
    currentGuest?: string;
}

// ─── Component ───────────────────────────────────────────────────

export default function RoomDetailModal({
    location,
    room,
    isOccupied,
    mode,
    periodStart,
    periodEnd,
    onClose,
    currentGuest,
}: Props) {
    const [details, setDetails] = useState<UnitRoomDetailData[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasNext, setHasNext] = useState(false);
    const pageSize = mode === 'last_checkins' ? 5 : 10;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        if (mode === 'active_or_period') {
            // C5: Occupied unit — fetch filter-period or active guests
            import('@/app/(dashboard)/unit/actions')
                .then(({ fetchUnitRoomDetails }) =>
                    fetchUnitRoomDetails({
                        location,
                        room,
                        periodStart,
                        periodEnd,
                        mode: 'active_or_period',
                        page,
                        pageSize,
                    }),
                )
                .then((result) => {
                    if (!cancelled) {
                        setDetails(result.data);
                        setTotal(result.total);
                        setHasNext(false); // no pagination for occupied mode
                    }
                })
                .catch(() => {
                    if (!cancelled) setDetails([]);
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        } else {
            // C6: Empty unit — fetch last check-ins with pagination
            import('@/app/(dashboard)/unit/actions')
                .then(({ fetchUnitLastCheckins }) =>
                    fetchUnitLastCheckins({
                        location,
                        room,
                        page,
                        pageSize,
                    }),
                )
                .then((result) => {
                    if (!cancelled) {
                        setDetails(result.data);
                        setTotal(result.total);
                        setHasNext(result.hasNext);
                    }
                })
                .catch(() => {
                    if (!cancelled) setDetails([]);
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }

        return () => {
            cancelled = true;
        };
    }, [location, room, mode, periodStart, periodEnd, page, pageSize]);

    // ── Section title ──
    const sectionTitle =
        mode === 'active_or_period'
            ? periodStart && periodEnd
                ? 'Tamu pada periode/filter'
                : 'Tamu yang sedang menginap'
            : 'Check-in terakhir di unit ini';

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/50"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between bg-slate-50">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500 uppercase truncate">{location}</p>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{room}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-200 rounded-lg flex-shrink-0"
                        aria-label="Tutup"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                            <span className="ml-2 text-sm text-gray-500">Memuat data...</span>
                        </div>
                    ) : details.length === 0 ? (
                        currentGuest ? (
                            <div className="text-center py-8 space-y-2">
                                <p className="text-sm font-medium text-orange-700">
                                    Unit sedang terisi dari transaksi aktif sebelumnya
                                </p>
                                <p className="text-xs text-gray-500">
                                    Tamu:{' '}
                                    <span className="font-semibold">{currentGuest}</span>
                                </p>
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 py-8">
                                {mode === 'last_checkins'
                                    ? 'Belum ada riwayat check-in untuk unit ini.'
                                    : 'Tidak ada transaksi di periode ini.'}
                            </p>
                        )
                    ) : (
                        <>
                            <div className="bg-slate-50 rounded-lg px-4 py-2 text-sm flex items-center justify-between">
                                <span>
                                    {sectionTitle}: <strong>{details.length}</strong>
                                    {total > 0 && total !== details.length && (
                                        <span className="text-gray-400"> dari {total}</span>
                                    )}
                                </span>
                            </div>

                            {details.map((detail) => {
                                const checkinDate = detail.checkin_at
                                    ? new Date(detail.checkin_at)
                                    : new Date(detail.created_at);
                                const checkoutDate = detail.checkout_at
                                    ? new Date(detail.checkout_at)
                                    : null;

                                return (
                                    <div
                                        key={detail.id}
                                        className="border border-gray-200 rounded-xl p-4 space-y-2"
                                    >
                                        <p className="text-xs text-gray-500">
                                            {checkinDate.toLocaleDateString('id-ID', {
                                                weekday: 'long',
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                timeZone: 'Asia/Jakarta',
                                            })}{' '}
                                            WIB
                                            {checkoutDate && (
                                                <>
                                                    {' → '}
                                                    {checkoutDate.toLocaleDateString('id-ID', {
                                                        day: 'numeric',
                                                        month: 'long',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        timeZone: 'Asia/Jakarta',
                                                    })}
                                                    {' WIB'}
                                                </>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4 text-gray-400" />
                                            <span className="font-bold text-gray-900">
                                                {detail.customer_name || '-'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>
                                                Durasi:{' '}
                                                <strong>
                                                    {formatDuration(detail.rental_duration ?? 0)}
                                                </strong>
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Pagination for last_checkins mode */}
                            {mode === 'last_checkins' && total > pageSize && (
                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                                    <button
                                        type="button"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => p - 1)}
                                        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Sebelumnya
                                    </button>
                                    <span className="text-sm text-gray-500">
                                        Halaman {page}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={!hasNext}
                                        onClick={() => setPage((p) => p + 1)}
                                        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Berikutnya
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
