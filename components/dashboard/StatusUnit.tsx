'use client';

import { CheckCircle, User, Building } from 'lucide-react';
import type { UnitStatusCounts } from '@/types/dashboard';

interface StatusUnitProps {
    statusCounts: UnitStatusCounts;
    isLoading?: boolean;
}

interface StatusItemConfig {
    key: keyof UnitStatusCounts;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
    bgClass: string;
}

const statusItems: StatusItemConfig[] = [
    {
        key: 'tersedia',
        label: 'Tersedia',
        icon: CheckCircle,
        colorClass: 'text-green-600',
        bgClass: 'bg-green-50',
    },
    {
        key: 'ditempati',
        label: 'Ditempati',
        icon: User,
        colorClass: 'text-blue-600',
        bgClass: 'bg-blue-50',
    },
];

/**
 * StatusUnit Component
 * 
 * Displays unit status summary: Tersedia and Ditempati with total count.
 * Data based on: checkin_at <= now AND checkout_at >= now (active stays).
 */
export default function StatusUnit({ statusCounts, isLoading = false }: StatusUnitProps) {
    const total = statusCounts.tersedia + statusCounts.ditempati;

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Status Unit</h3>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <Building className="w-4 h-4" />
                    <span>{total} total</span>
                </div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-2 gap-4">
                {statusItems.map((item) => {
                    const Icon = item.icon;
                    const count = statusCounts[item.key];

                    return (
                        <div
                            key={item.key}
                            className={`flex flex-col items-center justify-center rounded-lg p-4 ${item.bgClass}`}
                        >
                            {isLoading ? (
                                <>
                                    <div className="mb-2 h-8 w-8 animate-pulse rounded-full bg-gray-300" />
                                    <div className="mb-1 h-4 w-16 animate-pulse rounded bg-gray-300" />
                                    <div className="h-6 w-12 animate-pulse rounded bg-gray-300" />
                                </>
                            ) : (
                                <>
                                    <Icon className={`mb-2 h-8 w-8 ${item.colorClass}`} />
                                    <p className="mb-1 text-sm font-medium text-gray-600">{item.label}</p>
                                    <p className={`text-2xl font-bold ${item.colorClass}`}>{count}</p>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="mt-3 text-xs text-gray-400 text-center">
                Berdasarkan tamu yang sedang aktif menginap (check-in ≤ sekarang &amp; check-out ≥ sekarang)
            </p>
        </div>
    );
}
