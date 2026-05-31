'use client';

import { useEffect, useState } from 'react';
import { X, Clock, User, Loader2 } from 'lucide-react';
import type { RoomDetail, DateFilter } from '@/app/(dashboard)/laporan/actions';
import { formatDuration } from '@/lib/utils/formatDuration';
import { formatCurrency } from '@/lib/utils/format';

interface Props {
    location: string;
    room: string;
    filter: DateFilter;
    onClose: () => void;
    /** Guest name from the unit card — used for fallback display when
     *  the unit is occupied but no exact checkin-date match exists
     *  (active stay carried over from previous period). */
    currentGuest?: string;
}

export default function RoomDetailModal({ location, room, filter, onClose, currentGuest }: Props) {
    const [details, setDetails] = useState<RoomDetail[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        import('@/app/(dashboard)/laporan/actions')
            .then(({ fetchRoomDetails }) => fetchRoomDetails(location, room, filter))
            .then(d => { if (!cancelled) setDetails(d); })
            .catch(() => { if (!cancelled) setDetails([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [location, room, filter]);

    const totalRevenue = details.reduce((s, d) => s + d.cashAmount + d.transferAmount, 0);

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/50" onClick={onClose}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between bg-slate-50">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500 uppercase truncate">{location}</p>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{room}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg flex-shrink-0" aria-label="Tutup">
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
                                    Tamu: <span className="font-semibold">{currentGuest}</span>
                                </p>
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 py-8">Tidak ada transaksi di periode ini.</p>
                        )
                    ) : (
                        <>
                            <div className="bg-slate-50 rounded-lg px-4 py-2 text-sm">
                                Transaksi: <strong>{details.length}</strong> · Pendapatan: <strong className="text-green-700">{formatCurrency(totalRevenue)}</strong>
                            </div>
                            {details.map(detail => (
                                <div key={detail.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
                                    <p className="text-xs text-gray-500">
                                        {new Date(detail.checkinAt).toLocaleDateString('id-ID', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            timeZone: 'Asia/Jakarta',
                                        })} WIB
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-gray-400" />
                                        <span className="font-bold text-gray-900">{detail.customerName}</span>
                                    </div>
                                    {detail.marketingName && (
                                        <p className="text-sm text-gray-600">
                                            Marketing: {detail.marketingName}
                                            {detail.marketingFee > 0 && <span className="text-orange-600"> · Komisi: {formatCurrency(detail.marketingFee)}</span>}
                                            {detail.marketingFee === 0 && <span className="text-green-600"> · Rp 0 (Tanpa komisi)</span>}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Durasi: <strong>{formatDuration(detail.rentalDuration)}</strong></span>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-3 mt-2">
                                        <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Pembayaran</p>
                                        {detail.cashAmount > 0 && <p className="text-sm">Tunai: <strong>{formatCurrency(detail.cashAmount)}</strong></p>}
                                        {detail.transferAmount > 0 && (
                                            <p className="text-sm">Transfer: <strong className="text-blue-700">{formatCurrency(detail.transferAmount)}</strong>
                                                {detail.transferTo && <span className="text-gray-500"> → {detail.transferTo}</span>}
                                            </p>
                                        )}
                                        <p className="text-sm font-bold mt-1">Total: {formatCurrency(detail.cashAmount + detail.transferAmount)}</p>
                                    </div>
                                    {detail.inputBy && (
                                        <p className="text-xs text-gray-400 italic">Diinput oleh: {detail.inputBy} (shift: {detail.shift || '-'})</p>
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
