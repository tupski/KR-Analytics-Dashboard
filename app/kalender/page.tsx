import { createServerClient } from '@/lib/supabase/server';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import AIInsightCard from '@/components/ai/AIInsightCard';
import { getHolidayName, isWeekend } from '@/lib/liburNasional';

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

    return {
        days,
        dayCounts,
        monthLabel: format(now, 'MMMM yyyy', { locale: idLocale }),
    };
}

export default async function KalenderPage() {
    const { days, dayCounts, monthLabel } = await fetchCalendarData();
    const timezone = 'Asia/Jakarta';
    const today = format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd');

    const getHeatBg = (count: number, isHol: boolean, isWknd: boolean) => {
        if (count === 0) {
            if (isHol) return 'bg-red-50';
            if (isWknd) return 'bg-orange-50';
            return 'bg-gray-50';
        }
        if (count <= 2) return 'bg-green-100';
        if (count <= 5) return 'bg-green-200';
        if (count <= 10) return 'bg-green-300';
        if (count <= 20) return 'bg-green-400';
        return 'bg-green-500';
    };

    const firstDayOfWeek = days[0].getDay(); // 0 = Sun

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Kalender</h1>
                <p className="mt-1 text-xs sm:text-sm text-gray-500 capitalize">
                    Kalender booking bulanan — {monthLabel}
                </p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                <AIInsightCard
                    title="Insight Kalender"
                    prompt="Analisis pola booking bulan ini: hari apa yang paling ramai, apakah ada pola weekend vs weekday vs libur nasional, dan prediksi untuk minggu depan. Maksimal 4 kalimat."
                />

                {/* Calendar Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 shadow-sm">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 capitalize">{monthLabel}</h2>

                    {/* Day-of-week headers */}
                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d, i) => (
                            <div
                                key={d}
                                className={`text-center text-xs font-semibold py-1 ${i === 0 || i === 6 ? 'text-orange-500' : 'text-gray-500'}`}
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Calendar cells */}
                    <div className="grid grid-cols-7 gap-1">
                        {/* Padding for first week */}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square" />
                        ))}

                        {days.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const count = dayCounts[dateStr] || 0;
                            const isToday = dateStr === today;
                            const holidayName = getHolidayName(dateStr);
                            const weekend = isWeekend(day);
                            const dayNum = day.getDay();

                            const bg = getHeatBg(count, !!holidayName, weekend);
                            const isGreen = count > 10;

                            return (
                                <div
                                    key={dateStr}
                                    className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-colors cursor-default select-none
                                        ${bg}
                                        ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                                        ${holidayName ? 'ring-1 ring-red-300' : ''}
                                    `}
                                    title={[
                                        format(day, 'EEEE, dd MMMM yyyy', { locale: idLocale }),
                                        count > 0 ? `${count} booking` : 'Tidak ada booking',
                                        holidayName ? `🎌 ${holidayName}` : '',
                                    ].filter(Boolean).join('\n')}
                                >
                                    {/* Holiday dot indicator */}
                                    {holidayName && (
                                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-400" />
                                    )}

                                    {/* Day number */}
                                    <span className={`font-semibold leading-none ${isToday ? 'text-blue-700' :
                                        holidayName ? 'text-red-600' :
                                            weekend ? 'text-orange-600' :
                                                isGreen ? 'text-white' :
                                                    'text-gray-800'
                                        }`}>
                                        {format(day, 'd')}
                                    </span>

                                    {/* Booking count */}
                                    {count > 0 && (
                                        <span className={`text-[9px] font-bold mt-0.5 leading-none ${isGreen ? 'text-white' : 'text-gray-600'}`}>
                                            {count}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <div className="flex gap-0.5">
                                {['bg-gray-50', 'bg-green-100', 'bg-green-200', 'bg-green-300', 'bg-green-400', 'bg-green-500'].map(c => (
                                    <div key={c} className={`w-3.5 h-3.5 rounded ${c} border border-gray-200`} />
                                ))}
                            </div>
                            <span>Booking: kosong → ramai</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3.5 h-3.5 rounded bg-red-50 ring-1 ring-red-300 relative">
                                <span className="absolute top-0 right-0 w-1 h-1 rounded-full bg-red-400" />
                            </div>
                            <span>Libur nasional / cuti bersama</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3.5 h-3.5 rounded bg-orange-50" />
                            <span>Weekend</span>
                        </div>
                    </div>

                    {/* Holiday list for the month */}
                    {(() => {
                        const thisMonthHolidays = days
                            .map(d => ({ date: format(d, 'yyyy-MM-dd'), day: d, name: getHolidayName(format(d, 'yyyy-MM-dd')) }))
                            .filter(h => h.name);

                        if (thisMonthHolidays.length === 0) return null;

                        return (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-xs font-semibold text-gray-600 mb-2">🎌 Libur Nasional Bulan Ini</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {thisMonthHolidays.map(h => (
                                        <div key={h.date} className="flex items-center gap-2 text-xs">
                                            <span className="text-gray-500 font-mono w-14 flex-shrink-0">
                                                {format(h.day, 'dd MMM', { locale: idLocale })}
                                            </span>
                                            <span className="text-red-700 font-medium">{h.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </main>
        </div>
    );
}
