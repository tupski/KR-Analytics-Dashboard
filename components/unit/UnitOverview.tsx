'use client';

import { Building, User, CheckCircle } from 'lucide-react';

interface UnitOverviewProps {
    totalUnits: number;
    occupiedToday: number;
    availableToday: number;
}

export default function UnitOverview({ totalUnits, occupiedToday, availableToday }: UnitOverviewProps) {
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedToday / totalUnits) * 10000) / 100 : 0;

    const stats = [
        {
            title: 'Total Unit',
            value: totalUnits,
            icon: Building,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
        },
        {
            title: 'Terisi Hari Ini',
            value: occupiedToday,
            subtitle: `${occupancyRate}% okupansi`,
            icon: User,
            color: 'text-orange-600',
            bg: 'bg-orange-50',
        },
        {
            title: 'Tersedia',
            value: availableToday,
            icon: CheckCircle,
            color: 'text-green-600',
            bg: 'bg-green-50',
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                    <div
                        key={stat.title}
                        className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-lg ${stat.bg}`}>
                                <Icon className={`w-5 h-5 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">{stat.title}</p>
                                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                {stat.subtitle && (
                                    <p className="text-xs text-gray-500">{stat.subtitle}</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
