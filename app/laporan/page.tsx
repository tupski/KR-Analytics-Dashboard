import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import AIInsightCard from '@/components/ai/AIInsightCard';
import { FileText, Download } from 'lucide-react';

async function fetchReportData() {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');
    const monthStart = format(toZonedTime(new Date(), timezone), 'yyyy-MM-01');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const { count: totalTransactions } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true });

    const { data: monthTx, count: monthCount } = await supabase
        .from('transactions')
        .select('cash_amount, transfer_amount, apartment_location, rental_duration', { count: 'exact' })
        .gte('checkin_at', `${monthStart}T00:00:00`);

    const monthRevenue = monthTx?.reduce((s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0) || 0;
    const avgDuration = monthTx && monthTx.length > 0
        ? (monthTx.reduce((s: number, t: any) => s + (t.rental_duration || 0), 0) / monthTx.length).toFixed(1)
        : '0';

    // Top locations
    const locCounts: Record<string, number> = {};
    monthTx?.forEach((t: any) => { locCounts[t.apartment_location] = (locCounts[t.apartment_location] || 0) + 1; });
    const topLocations = Object.entries(locCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { totalTransactions: totalTransactions || 0, monthCount: monthCount || 0, monthRevenue, avgDuration, topLocations };
}

export default async function LaporanPage() {
    const data = await fetchReportData();
    const fmt = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Laporan</h1>
                <p className="mt-1 text-sm text-gray-500">Ringkasan laporan operasional Kakarama Room</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                <AIInsightCard
                    title="Insight Laporan"
                    prompt="Buat ringkasan laporan bulanan: total transaksi, pendapatan, rata-rata durasi menginap, dan lokasi terbaik. Berikan 1 rekomendasi strategis. Maksimal 4 kalimat."
                />

                {/* Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <p className="text-sm text-gray-500">Total Transaksi (All Time)</p>
                        <p className="text-2xl font-bold text-gray-900">{data.totalTransactions.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <p className="text-sm text-gray-500">Transaksi Bulan Ini</p>
                        <p className="text-2xl font-bold text-gray-900">{data.monthCount.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <p className="text-sm text-gray-500">Pendapatan Bulan Ini</p>
                        <p className="text-2xl font-bold text-gray-900">{fmt(data.monthRevenue)}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <p className="text-sm text-gray-500">Rata-rata Durasi</p>
                        <p className="text-2xl font-bold text-gray-900">{data.avgDuration} jam</p>
                    </div>
                </div>

                {/* Top Locations */}
                <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Lokasi (Bulan Ini)</h2>
                    <div className="space-y-3">
                        {data.topLocations.map(([name, count], i) => (
                            <div key={name} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                                    <span className="text-sm font-medium text-gray-900">{name}</span>
                                </div>
                                <span className="text-sm text-gray-600">{count} transaksi</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
