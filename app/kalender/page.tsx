import { createServerClient } from '@/lib/supabase/server';
import { format, subDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import AIInsightCard from '@/components/ai/AIInsightCard';

async function fetchCalendarData() {
    const supabase = createServerClient();
    const timezone = 'Asia/Jakarta';
    const now = toZonedTime(new Date(), timezone);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const { data } = await supabase
        .from('transactions')
        .select('checkin_at, apartment_location')
        .gte('checkin_at', `${format(monthStart, 'yyyy-MM-dd')}T00:00:00`)
        .lte('checkin_at', `${format(monthEnd, 'yyyy-MM-dd')}T23:59:59`);

    // Count bookings per day
    const dayCounts: Record<string, number> = {};
    data?.forEach((t: any) => {
        const day = format(new Date(t.checkin_at), 'yyyy-MM-dd');
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return { days, dayCounts, monthLabel: format(now, 'MMMM yyyy', { locale: idLocale }) };
}

export default async function KalenderPage() {
    const { days, dayCounts, monthLabel } = await fetchCalendarData();
    const today = format(new Date(), 'yyyy-MM-dd');

    const getIntensity = (count: number) => {
        if (count === 0) return 'bg-gray-50';
        if (count <= 2) return 'bg-green-100';
        if (count <= 5) return 'bg-green-200';
        if (count <= 10) return 'bg-green-300';
        return 'bg-green-500 text-white';
    };

    // Pad start of month to align with day of week
    const firstDayOfWeek = days[0].getDay(); // 0=Sun

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kalender</h1>
                <p className="mt-1 text-sm text-gray-500">Kalender booking bulanan — {monthLabel}</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                <AIInsightCard
                    title="Insight Kalender"
                    prompt="Analisis pola booking bulan ini: hari apa yang paling ramai, apakah ada pola weekend vs weekday, dan prediksi untuk minggu depan. Maksimal 3 kalimat."
                />

                {/* Calendar Grid */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 capitalize">{monthLabel}</h2>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(d => (
                            <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
                        ))}
                    </div>

                    {/* Calendar cells */}
                    <div className="grid grid-cols-7 gap-1">
                        {/* Empty cells for padding */}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square"></div>
                        ))}

                        {days.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const count = dayCounts[dateStr] || 0;
                            const isToday = dateStr === today;

                            return (
                                <div
                                    key={dateStr}
                                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-colors ${getIntensity(count)} ${isToday ? 'ring-2 ring-blue-500' : ''}`}
                                    title={`${format(day, 'dd MMM')}: ${count} booking`}
                                >
                                    <span className={`font-medium ${isToday ? 'text-blue-700' : ''}`}>{format(day, 'd')}</span>
                                    {count > 0 && <span className="text-[10px] font-bold">{count}</span>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                        <span>Sedikit</span>
                        <div className="flex gap-1">
                            <div className="w-4 h-4 rounded bg-gray-50 border"></div>
                            <div className="w-4 h-4 rounded bg-green-100"></div>
                            <div className="w-4 h-4 rounded bg-green-200"></div>
                            <div className="w-4 h-4 rounded bg-green-300"></div>
                            <div className="w-4 h-4 rounded bg-green-500"></div>
                        </div>
                        <span>Banyak</span>
                    </div>
                </div>
            </main>
        </div>
    );
}
