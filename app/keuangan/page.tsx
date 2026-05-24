import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import AIInsightCard from '@/components/ai/AIInsightCard';
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';

async function fetchFinanceData() {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const monthStart = format(toZonedTime(new Date(), timezone), 'yyyy-MM-01');
    const prevMonthStart = format(subDays(new Date(monthStart), 1), 'yyyy-MM-01');

    // Today revenue
    const { data: todayData } = await supabase
        .from('transactions')
        .select('cash_amount, transfer_amount')
        .gte('checkin_at', `${today}T00:00:00`)
        .lt('checkin_at', `${today}T23:59:59`);

    const todayRevenue = todayData?.reduce((s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0) || 0;
    const todayCash = todayData?.reduce((s: number, t: any) => s + (t.cash_amount || 0), 0) || 0;
    const todayTransfer = todayData?.reduce((s: number, t: any) => s + (t.transfer_amount || 0), 0) || 0;

    // This month
    const { data: monthData } = await supabase
        .from('transactions')
        .select('cash_amount, transfer_amount, apartment_location, checkin_at')
        .gte('checkin_at', `${monthStart}T00:00:00`);

    const monthRevenue = monthData?.reduce((s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0) || 0;

    // Previous month
    const { data: prevMonthData } = await supabase
        .from('transactions')
        .select('cash_amount, transfer_amount')
        .gte('checkin_at', `${prevMonthStart}T00:00:00`)
        .lt('checkin_at', `${monthStart}T00:00:00`);

    const prevMonthRevenue = prevMonthData?.reduce((s: number, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0) || 0;

    // Revenue per location this month
    const locationRevenue: Record<string, number> = {};
    monthData?.forEach((t: any) => {
        const loc = t.apartment_location;
        locationRevenue[loc] = (locationRevenue[loc] || 0) + (t.cash_amount || 0) + (t.transfer_amount || 0);
    });

    const locationBreakdown = Object.entries(locationRevenue)
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue);

    return { todayRevenue, todayCash, todayTransfer, monthRevenue, prevMonthRevenue, locationBreakdown };
}

export default async function KeuanganPage() {
    const data = await fetchFinanceData();
    const fmt = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
    const monthGrowth = data.prevMonthRevenue > 0
        ? ((data.monthRevenue - data.prevMonthRevenue) / data.prevMonthRevenue * 100).toFixed(1)
        : '0';
    const isGrowthPositive = Number(monthGrowth) >= 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Keuangan</h1>
                <p className="mt-1 text-sm text-gray-500">Ringkasan pendapatan dan keuangan Kakarama Room</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                <AIInsightCard
                    title="Insight Keuangan"
                    prompt="Analisis keuangan: bandingkan pendapatan bulan ini vs bulan lalu, sebutkan tren (naik/turun berapa persen), lokasi kontributor terbesar, dan saran untuk meningkatkan revenue. Maksimal 4 kalimat."
                />

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-green-50"><Wallet className="w-5 h-5 text-green-600" /></div>
                            <div>
                                <p className="text-sm text-gray-500">Pendapatan Hari Ini</p>
                                <p className="text-xl font-bold text-gray-900">{fmt(data.todayRevenue)}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-50"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
                            <div>
                                <p className="text-sm text-gray-500">Pendapatan Bulan Ini</p>
                                <p className="text-xl font-bold text-gray-900">{fmt(data.monthRevenue)}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <p className="text-sm text-gray-500 mb-1">Cash Hari Ini</p>
                        <p className="text-lg font-bold text-gray-900">{fmt(data.todayCash)}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                        <p className="text-sm text-gray-500 mb-1">Transfer Hari Ini</p>
                        <p className="text-lg font-bold text-gray-900">{fmt(data.todayTransfer)}</p>
                    </div>
                </div>

                {/* Growth */}
                <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        {isGrowthPositive ? <ArrowUpRight className="w-5 h-5 text-green-600" /> : <ArrowDownRight className="w-5 h-5 text-red-600" />}
                        <div>
                            <p className="text-sm text-gray-500">Pertumbuhan vs Bulan Lalu</p>
                            <p className={`text-2xl font-bold ${isGrowthPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {isGrowthPositive ? '+' : ''}{monthGrowth}%
                            </p>
                            <p className="text-xs text-gray-400">Bulan lalu: {fmt(data.prevMonthRevenue)}</p>
                        </div>
                    </div>
                </div>

                {/* Revenue per Location */}
                <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Pendapatan Per Lokasi (Bulan Ini)</h2>
                    <div className="space-y-3">
                        {data.locationBreakdown.map((loc, i) => (
                            <div key={loc.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-500 w-6">{i + 1}.</span>
                                    <span className="text-sm font-medium text-gray-900">{loc.name}</span>
                                </div>
                                <span className="text-sm font-bold text-gray-900">{fmt(loc.revenue)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
