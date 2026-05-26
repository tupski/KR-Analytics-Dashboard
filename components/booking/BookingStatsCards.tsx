'use client';

import { Calendar, CalendarDays, CalendarRange, Wallet } from 'lucide-react';

interface BookingStats {
    todayCount: number;
    weekCount: number;
    monthCount: number;
    monthRevenue: number;
}

export default function BookingStatsCards({ stats }: { stats: BookingStats }) {
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const cards = [
        {
            title: 'Booking Hari Ini',
            value: stats.todayCount.toString(),
            icon: Calendar,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
        },
        {
            title: 'Minggu Ini',
            value: stats.weekCount.toString(),
            icon: CalendarDays,
            color: 'text-green-600',
            bg: 'bg-green-50',
        },
        {
            title: 'Bulan Ini',
            value: stats.monthCount.toString(),
            icon: CalendarRange,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
        },
        {
            title: 'Pendapatan Bulan Ini',
            value: formatCurrency(stats.monthRevenue),
            icon: Wallet,
            color: 'text-orange-600',
            bg: 'bg-orange-50',
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {cards.map((card) => {
                const Icon = card.icon;
                return (
                    <div
                        key={card.title}
                        className="bg-white rounded-lg border border-gray-200 p-3 sm:p-5 shadow-sm"
                    >
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`p-2 sm:p-2.5 rounded-lg ${card.bg} flex-shrink-0`}>
                                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${card.color}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs sm:text-sm text-gray-500 truncate">{card.title}</p>
                                <p className={`text-base sm:text-xl font-bold text-gray-900 truncate`}>{card.value}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
