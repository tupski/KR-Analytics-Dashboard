'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Receipt,
    AlertTriangle,
    X,
    Clock,
    User,
    ChevronUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import type { LaporanData, RoomDetail, DateFilter } from '@/app/laporan/actions';
import ExpenseCategoryModal from './ExpenseCategoryModal';

interface LaporanClientProps {
    data: LaporanData;
    highOccupancy: { location: string; totalRooms: number; usedRoomDays: number; totalPossibleRoomDays: number; occupancyRate: number }[];
}

const fmt = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

const FILTERS: { value: DateFilter; label: string }[] = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'yesterday', label: 'Kemarin' },
    { value: '7days', label: '7 Hari' },
    { value: 'month', label: 'Bulan Ini' },
    { value: 'year', label: 'Tahun Ini' },
];

export default function LaporanClient({ data, highOccupancy }: LaporanClientProps) {
    const router = useRouter();
    const [selectedRoom, setSelectedRoom] = useState<{ location: string; room: string } | null>(null);
    const [roomDetails, setRoomDetails] = useState<RoomDetail[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const locationRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const handleFilterChange = (filter: DateFilter) => {
        router.push(`/laporan?filter=${filter}`);
    };

    const scrollToLocation = (name: string) => {
        locationRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const openRoomDetail = async (location: string, room: string) => {
        setSelectedRoom({ location, room });
        setLoadingDetails(true);
        try {
            const { fetchRoomDetails } = await import('@/app/laporan/actions');
            const details = await fetchRoomDetails(location, room, data.filter);
            setRoomDetails(details);
        } catch {
            setRoomDetails([]);
        } finally {
            setLoadingDetails(false);
        }
    };

    // Comparison metrics
    const revenueDelta = data.comparison ? data.totalRevenue - data.comparison.prevRevenue : 0;
    const revenueGrowthPct = data.comparison && data.comparison.prevRevenue > 0
        ? ((revenueDelta) / data.comparison.prevRevenue * 100)
        : null;

    const expenseDelta = data.comparison ? data.totalExpenses - data.comparison.prevExpenses : 0;
    const expenseGrowthPct = data.comparison && data.comparison.prevExpenses > 0
        ? ((expenseDelta) / data.comparison.prevExpenses * 100)
        : null;

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Filter */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {FILTERS.map(f => (
                    <button
                        key={f.value}
                        onClick={() => handleFilterChange(f.value)}
                        className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${data.filter === f.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Summary Cards — equal height */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
                <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 shadow-sm flex flex-col">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="p-2 sm:p-2.5 rounded-lg bg-green-50 flex-shrink-0"><Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" /></div>
                        <div className="min-w-0">
                            <p className="text-xs sm:text-sm text-gray-500">Pendapatan</p>
                            <p className="text-base sm:text-xl font-bold text-gray-900 truncate">{fmt(data.totalRevenue)}</p>
                            <p className="text-[10px] sm:text-xs text-gray-400">{data.totalTransactions} transaksi</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 shadow-sm flex flex-col">
                    <p className="text-xs sm:text-sm text-gray-500 mb-1">Cash / Transfer</p>
                    <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{fmt(data.totalCash)}</p>
                    <p className="text-xs sm:text-sm font-bold text-blue-600 truncate">{fmt(data.totalTransfer)}</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 shadow-sm flex flex-col">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="p-2 sm:p-2.5 rounded-lg bg-red-50 flex-shrink-0"><Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" /></div>
                        <div className="min-w-0">
                            <p className="text-xs sm:text-sm text-gray-500">Pengeluaran</p>
                            <p className="text-base sm:text-xl font-bold text-red-600 truncate">{fmt(data.totalExpenses)}</p>
                        </div>
                    </div>
                </div>

                {data.comparison && (
                    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 shadow-sm flex flex-col">
                        <p className="text-xs sm:text-sm text-gray-500 mb-2 truncate">vs {data.comparison.prevLabel}</p>

                        {/* Pendapatan delta */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {revenueGrowthPct === null ? (
                                <span className="text-xs text-gray-500">Pendapatan: –</span>
                            ) : revenueGrowthPct >= 0 ? (
                                <>
                                    <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
                                    <span className="text-sm font-bold text-green-600">+{revenueGrowthPct.toFixed(1)}%</span>
                                    <span className="text-xs text-gray-500 truncate hidden sm:inline">pendapatan naik</span>
                                </>
                            ) : (
                                <>
                                    <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
                                    <span className="text-sm font-bold text-red-600">{revenueGrowthPct.toFixed(1)}%</span>
                                    <span className="text-xs text-gray-500 truncate hidden sm:inline">pendapatan turun</span>
                                </>
                            )}
                        </div>

                        {/* Pengeluaran delta — caption "lebih besar/kecil" */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {expenseGrowthPct === null ? (
                                <span className="text-xs text-gray-500 truncate">
                                    Pengeluaran: {data.totalExpenses > 0 ? fmt(data.totalExpenses) : '–'}
                                </span>
                            ) : expenseGrowthPct >= 0 ? (
                                <>
                                    <TrendingUp className="w-4 h-4 text-red-600 shrink-0" />
                                    <span className="text-sm font-bold text-red-600">+{expenseGrowthPct.toFixed(1)}%</span>
                                    <span className="text-xs text-gray-500 truncate hidden sm:inline">pengeluaran lebih besar</span>
                                </>
                            ) : (
                                <>
                                    <TrendingDown className="w-4 h-4 text-green-600 shrink-0" />
                                    <span className="text-sm font-bold text-green-600">{expenseGrowthPct.toFixed(1)}%</span>
                                    <span className="text-xs text-gray-500 truncate hidden sm:inline">pengeluaran lebih kecil</span>
                                </>
                            )}
                        </div>

                        <p className="text-[10px] sm:text-[11px] text-gray-400 mt-auto pt-2 hidden sm:block">
                            Selisih: {revenueDelta >= 0 ? '+' : ''}{fmt(revenueDelta)} pendapatan, {expenseDelta >= 0 ? '+' : ''}{fmt(expenseDelta)} pengeluaran
                        </p>
                    </div>
                )}
            </div>

            {/* Tagihan & Fee */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Tagihan Unit</h3>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-green-700">Lunas</p>
                            <p className="text-base sm:text-lg font-bold text-green-700 truncate">{fmt(data.tagihan.paid)}</p>
                            <p className="text-xs text-green-600">{data.tagihan.paidCount} tagihan</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-red-700">Belum Bayar</p>
                            <p className="text-base sm:text-lg font-bold text-red-700 truncate">{fmt(data.tagihan.unpaid)}</p>
                            <p className="text-xs text-red-600">{data.tagihan.unpaidCount} tagihan</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Fee Marketing</h3>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-green-700">Sudah Dibayar</p>
                            <p className="text-base sm:text-lg font-bold text-green-700 truncate">{fmt(data.feeMarketing.totalPaid)}</p>
                            <p className="text-xs text-green-600">{data.feeMarketing.paidCount} item</p>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-orange-700">Belum Dibayar</p>
                            <p className="text-base sm:text-lg font-bold text-orange-700 truncate">{fmt(data.feeMarketing.totalUnpaid)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expenses by Category — clickable */}
            {data.expenses.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-3 gap-2">
                        <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Pengeluaran Per Kategori</h3>
                        <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:inline">Klik kategori untuk lihat detail</span>
                    </div>
                    <div className="space-y-1">
                        {data.expenses.map(e => (
                            <button
                                key={e.category}
                                onClick={() => setSelectedCategory(e.category)}
                                className="w-full flex items-center justify-between gap-2 py-2 px-2 sm:px-3 -mx-2 sm:-mx-3 rounded-lg hover:bg-blue-50/60 transition-colors text-left border-b border-gray-50 last:border-0"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs sm:text-sm text-gray-700 group-hover:text-blue-700 truncate">{e.category}</span>
                                    <span className="text-[10px] sm:text-xs text-gray-400 flex-shrink-0">({e.count}x)</span>
                                </div>
                                <span className="text-xs sm:text-sm font-semibold text-gray-900 flex-shrink-0">{fmt(e.total)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Location Cards - clickable to scroll */}
            <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Laporan Per Lokasi</h2>
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
                    {data.locations.map(loc => (
                        <button
                            key={loc.name}
                            onClick={() => scrollToLocation(loc.name)}
                            className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
                        >
                            {loc.name}
                        </button>
                    ))}
                </div>

                {/* Location Details */}
                <div className="space-y-4 sm:space-y-6">
                    {data.locations.map(loc => (
                        <div
                            key={loc.name}
                            ref={el => { locationRefs.current[loc.name] = el; }}
                            className="bg-white rounded-xl border border-blue-100 p-4 sm:p-5 shadow-sm"
                        >
                            <div className="flex items-center justify-between mb-3 gap-2">
                                <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">{loc.name}</h3>
                                <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0">{loc.totalRooms} kamar</span>
                            </div>
                            <div className="bg-slate-50 rounded-lg px-3 sm:px-4 py-2 mb-3 sm:mb-4 text-xs sm:text-sm break-words">
                                Transaksi: <strong>{loc.transactions}</strong> · Pendapatan: <strong className="text-green-700">{fmt(loc.revenue)}</strong>
                            </div>

                            {/* Expenses per location */}
                            {data.expensesPerLocation[loc.name] && data.expensesPerLocation[loc.name].length > 0 && (
                                <div className="bg-red-50/50 rounded-lg px-3 sm:px-4 py-3 mb-3 sm:mb-4">
                                    <p className="text-[10px] sm:text-xs font-semibold text-red-700 uppercase mb-2">Pengeluaran Lokasi Ini</p>
                                    <div className="flex flex-wrap gap-2 sm:gap-3">
                                        {data.expensesPerLocation[loc.name].map(exp => (
                                            <span key={exp.category} className="text-xs text-gray-700">
                                                {exp.category}: <strong className="text-red-700">{fmt(exp.total)}</strong> ({exp.count}x)
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Room cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                {loc.rooms.map(room => (
                                    <button
                                        key={room.roomNumber}
                                        onClick={() => openRoomDetail(loc.name, room.roomNumber)}
                                        className="text-left bg-white border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-blue-300 hover:shadow-md transition-all"
                                    >
                                        <p className="font-bold text-gray-900 text-base sm:text-lg truncate">{room.roomNumber}</p>
                                        <p className="text-xs sm:text-sm text-gray-600">Digunakan: <strong>{room.transactions}x</strong></p>
                                        <p className="text-xs sm:text-sm text-green-700 truncate">Pendapatan: <strong>{fmt(room.revenue)}</strong></p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* High Occupancy Location Alert */}
            {highOccupancy.length > 0 && (
                <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 sm:p-5">
                    <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <h3 className="font-semibold text-orange-900 text-sm sm:text-base">Lokasi Okupansi Tinggi (&ge;90%) — 30 Hari Terakhir</h3>
                    </div>
                    <p className="text-xs sm:text-sm text-orange-700 mb-3">Lokasi-lokasi ini secara keseluruhan memiliki okupansi sangat tinggi. Pertimbangkan untuk menambah unit baru di lokasi ini.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {highOccupancy.map(u => (
                            <div key={u.location} className="bg-white rounded-lg border border-orange-200 p-3 sm:p-4">
                                <p className="font-bold text-gray-900 text-sm sm:text-base truncate">{u.location}</p>
                                <p className="text-xs sm:text-sm text-gray-600">{u.totalRooms} kamar</p>
                                <p className="text-base sm:text-lg font-bold text-orange-700 mt-1">{u.occupancyRate}% okupansi</p>
                                <p className="text-[10px] sm:text-xs text-gray-500">{u.usedRoomDays} / {u.totalPossibleRoomDays} room-days terpakai</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Room Detail Modal */}
            {selectedRoom && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/50" onClick={() => setSelectedRoom(null)}>
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between bg-slate-50">
                            <div className="min-w-0">
                                <p className="text-xs text-gray-500 uppercase truncate">{selectedRoom.location}</p>
                                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{selectedRoom.room}</h2>
                            </div>
                            <button onClick={() => setSelectedRoom(null)} className="p-2 hover:bg-gray-200 rounded-lg flex-shrink-0">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                            {loadingDetails ? (
                                <div className="text-center py-8">
                                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                    <p className="text-sm text-gray-500 mt-2">Memuat data...</p>
                                </div>
                            ) : roomDetails.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">Tidak ada transaksi di periode ini.</p>
                            ) : (
                                <>
                                    <div className="bg-slate-50 rounded-lg px-4 py-2 text-sm">
                                        Transaksi: <strong>{roomDetails.length}</strong> · Pendapatan: <strong className="text-green-700">
                                            {fmt(roomDetails.reduce((s, d) => s + d.cashAmount + d.transferAmount, 0))}
                                        </strong>
                                    </div>
                                    {roomDetails.map(detail => (
                                        <div key={detail.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
                                            {/* Date */}
                                            <p className="text-xs text-gray-500">
                                                {new Date(detail.checkinAt).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB
                                            </p>
                                            {/* Customer */}
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-gray-400" />
                                                <span className="font-bold text-gray-900">{detail.customerName}</span>
                                            </div>
                                            {/* Marketing */}
                                            {detail.marketingName && (
                                                <p className="text-sm text-gray-600">
                                                    Marketing: {detail.marketingName}
                                                    {detail.marketingFee > 0 && <span className="text-orange-600"> · Komisi: {fmt(detail.marketingFee)}</span>}
                                                    {detail.marketingFee === 0 && <span className="text-green-600"> · Rp 0 (Tanpa komisi)</span>}
                                                </p>
                                            )}
                                            {/* Time */}
                                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                                <Clock className="w-3.5 h-3.5" />
                                                <span>Durasi: <strong>{detail.rentalDuration} JAM</strong></span>
                                            </div>
                                            {/* Payment */}
                                            <div className="bg-slate-50 rounded-lg p-3 mt-2">
                                                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Pembayaran</p>
                                                {detail.cashAmount > 0 && <p className="text-sm">Tunai: <strong>{fmt(detail.cashAmount)}</strong></p>}
                                                {detail.transferAmount > 0 && (
                                                    <p className="text-sm">Transfer: <strong className="text-blue-700">{fmt(detail.transferAmount)}</strong>
                                                        {detail.transferTo && <span className="text-gray-500"> → {detail.transferTo}</span>}
                                                    </p>
                                                )}
                                                <p className="text-sm font-bold mt-1">Total: {fmt(detail.cashAmount + detail.transferAmount)}</p>
                                            </div>
                                            {/* Input by */}
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
            )}

            {/* Expense Category Modal — paginated + sortable */}
            {selectedCategory && (
                <ExpenseCategoryModal
                    category={selectedCategory}
                    filter={data.filter}
                    onClose={() => setSelectedCategory(null)}
                />
            )}
        </div>
    );
}
