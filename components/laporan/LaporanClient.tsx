'use client';

import { useState, useRef } from 'react';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Receipt,
    AlertTriangle,
    X,
    Clock,
    User,
} from 'lucide-react';
import MetricCardHorizontal from '@/components/dashboard/MetricCardHorizontal';
import type { LaporanData, RoomDetail, ExpenseDetail } from '@/app/(dashboard)/laporan/actions';
import ExpenseCategoryModal from './ExpenseCategoryModal';
import { formatDuration } from '@/lib/utils/formatDuration';
import { formatCurrency } from '@/lib/utils/format';

interface LaporanClientProps {
    data: LaporanData;
    highOccupancy: { location: string; totalRooms: number; usedRoomDays: number; totalPossibleRoomDays: number; occupancyRate: number }[];
}

export default function LaporanClient({ data, highOccupancy }: LaporanClientProps) {
    const [selectedRoom, setSelectedRoom] = useState<{ location: string; room: string } | null>(null);
    const [roomDetails, setRoomDetails] = useState<RoomDetail[]>([]);
    const [roomExpenses, setRoomExpenses] = useState<ExpenseDetail[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const locationRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const scrollToLocation = (name: string) => {
        locationRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const openRoomDetail = async (location: string, room: string) => {
        setSelectedRoom({ location, room });
        setLoadingDetails(true);
        setRoomDetails([]);
        setRoomExpenses([]);
        try {
            const { fetchRoomDetails, fetchRoomExpenses } = await import('@/app/(dashboard)/laporan/actions');
            const [details, expenses] = await Promise.all([
                fetchRoomDetails(location, room, data.filter),
                fetchRoomExpenses(location, room, data.filter),
            ]);
            setRoomDetails(details);
            setRoomExpenses(expenses);
        } catch {
            setRoomDetails([]);
            setRoomExpenses([]);
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
            {/* Summary Cards — MetricCardHorizontal */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <MetricCardHorizontal
                    icon={<Wallet className="w-5 h-5" />}
                    title="Pendapatan"
                    value={formatCurrency(data.totalRevenue)}
                    subtitle={`${data.totalTransactions} transaksi`}
                    comparisonValue={data.comparison ? formatCurrency(data.comparison.prevRevenue) : undefined}
                    deltaAmount={data.comparison ? (revenueDelta >= 0 ? '+' : '') + formatCurrency(revenueDelta) : undefined}
                    deltaPercentage={revenueGrowthPct ?? undefined}
                    trend={revenueGrowthPct === null ? 'flat' : revenueGrowthPct >= 0 ? 'up' : 'down'}
                    comparisonLabel={data.comparison?.prevLabel}
                    isComparisonActive={!!data.comparison}
                    semanticType="revenue"
                />
                <MetricCardHorizontal
                    icon={<Receipt className="w-5 h-5" />}
                    title="Pengeluaran"
                    value={formatCurrency(data.totalExpenses)}
                    subtitle={`${data.expenses.length} kategori`}
                    comparisonValue={data.comparison ? formatCurrency(data.comparison.prevExpenses) : undefined}
                    deltaAmount={data.comparison ? (expenseDelta >= 0 ? '+' : '') + formatCurrency(expenseDelta) : undefined}
                    deltaPercentage={expenseGrowthPct ?? undefined}
                    trend={expenseGrowthPct === null ? 'flat' : expenseGrowthPct >= 0 ? 'up' : 'down'}
                    comparisonLabel={data.comparison?.prevLabel}
                    isComparisonActive={!!data.comparison}
                    semanticType="expense"
                />
                <MetricCardHorizontal
                    icon={<Wallet className="w-5 h-5" />}
                    title="Cash"
                    value={formatCurrency(data.totalCash)}
                    isComparisonActive={false}
                    semanticType="neutral"
                />
                <MetricCardHorizontal
                    icon={<Wallet className="w-5 h-5" />}
                    title="Transfer"
                    value={formatCurrency(data.totalTransfer)}
                    isComparisonActive={false}
                    semanticType="neutral"
                />
            </div>

            {/* Tagihan & Fee */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Tagihan Unit</h3>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-green-700">Lunas</p>
                            <p className="text-base sm:text-lg font-bold text-green-700 truncate">{formatCurrency(data.tagihan.paid)}</p>
                            <p className="text-xs text-green-600">{data.tagihan.paidCount} tagihan</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-red-700">Belum Bayar</p>
                            <p className="text-base sm:text-lg font-bold text-red-700 truncate">{formatCurrency(data.tagihan.unpaid)}</p>
                            <p className="text-xs text-red-600">{data.tagihan.unpaidCount} tagihan</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Fee Marketing</h3>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-green-700">Sudah Dibayar</p>
                            <p className="text-base sm:text-lg font-bold text-green-700 truncate">{formatCurrency(data.feeMarketing.totalPaid)}</p>
                            <p className="text-xs text-green-600">{data.feeMarketing.paidCount} item</p>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-orange-700">Belum Dibayar</p>
                            <p className="text-base sm:text-lg font-bold text-orange-700 truncate">{formatCurrency(data.feeMarketing.totalUnpaid)}</p>
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
                                    <span className="text-xs sm:text-sm text-gray-700 truncate">{e.category}</span>
                                    <span className="text-[10px] sm:text-xs text-gray-400 flex-shrink-0">({e.count}x)</span>
                                </div>
                                <span className="text-xs sm:text-sm font-semibold text-gray-900 flex-shrink-0">{formatCurrency(e.total)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Location Cards with sticky filter */}
            <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">Laporan Per Lokasi</h2>
                {/* Location filter pills — sticky on scroll */}
                <div className="sticky top-[110px] sm:top-[104px] z-20 bg-gradient-to-b from-slate-50/95 to-slate-50/80 backdrop-blur-sm py-2 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-2 border-b border-gray-200">
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
                                Transaksi: <strong>{loc.transactions}</strong> · Pendapatan: <strong className="text-green-700">{formatCurrency(loc.revenue)}</strong>
                            </div>

                            {/* Expenses per location */}
                            {data.expensesPerLocation[loc.name] && data.expensesPerLocation[loc.name].length > 0 && (
                                <div className="bg-red-50/50 rounded-lg px-3 sm:px-4 py-3 mb-3 sm:mb-4">
                                    <p className="text-[10px] sm:text-xs font-semibold text-red-700 uppercase mb-2">Pengeluaran Lokasi Ini</p>
                                    <div className="flex flex-wrap gap-2 sm:gap-3">
                                        {data.expensesPerLocation[loc.name].map(exp => (
                                            <span key={exp.category} className="text-xs text-gray-700">
                                                {exp.category}: <strong className="text-red-700">{formatCurrency(exp.total)}</strong> ({exp.count}x)
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
                                        <p className="text-xs sm:text-sm text-green-700 truncate">Pendapatan: <strong>{formatCurrency(room.revenue)}</strong></p>
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
                            ) : roomDetails.length === 0 && roomExpenses.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">Tidak ada transaksi di periode ini.</p>
                            ) : (
                                <>
                                    <div className="bg-slate-50 rounded-lg px-4 py-2 text-sm">
                                        Transaksi: <strong>{roomDetails.length}</strong> · Pendapatan: <strong className="text-green-700">
                                            {formatCurrency(roomDetails.reduce((s, d) => s + d.cashAmount + d.transferAmount, 0))}
                                        </strong>
                                    </div>

                                    {/* Room-level expenses */}
                                    {roomExpenses.length > 0 && (
                                        <div className="bg-red-50/50 rounded-lg px-3 sm:px-4 py-3">
                                            <p className="text-[10px] sm:text-xs font-semibold text-red-700 uppercase mb-2">Pengeluaran Unit Ini</p>
                                            <div className="space-y-1.5">
                                                {(() => {
                                                    const catMap: Record<string, { total: number; count: number; items: typeof roomExpenses }> = {};
                                                    roomExpenses.forEach(e => {
                                                        const cat = e.namaPengeluaran || 'Lainnya';
                                                        if (!catMap[cat]) catMap[cat] = { total: 0, count: 0, items: [] };
                                                        catMap[cat].total += e.jumlah;
                                                        catMap[cat].count++;
                                                        catMap[cat].items.push(e);
                                                    });
                                                    return Object.entries(catMap)
                                                        .sort((a, b) => b[1].total - a[1].total)
                                                        .map(([cat, d]) => (
                                                            <div key={cat} className="text-xs text-gray-700 border-b border-red-100 pb-1 last:border-0 last:pb-0">
                                                                <span>{cat}: <strong className="text-red-700">{formatCurrency(d.total)}</strong> ({d.count}x)</span>
                                                                {d.items.map(item => (
                                                                    <div key={item.id} className="ml-2 text-[11px] text-gray-500 flex justify-between">
                                                                        <span>{new Date(item.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                                        <span>{formatCurrency(item.jumlah)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ));
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                    {roomDetails.map(detail => (
                                        <div key={detail.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
                                            <p className="text-xs text-gray-500">
                                                {new Date(detail.checkinAt).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB
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
            )}

            {/* Expense Category Modal */}
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
