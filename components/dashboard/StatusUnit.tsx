'use client';

import { CheckCircle, User, Sparkles, Wrench } from 'lucide-react';
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
    {
        key: 'cleaning',
        label: 'Cleaning',
        icon: Sparkles,
        colorClass: 'text-yellow-600',
        bgClass: 'bg-yellow-50',
    },
    {
        key: 'maintenance',
        label: 'Maintenance',
        icon: Wrench,
        colorClass: 'text-red-600',
        bgClass: 'bg-red-50',
    },
];

/**
 * StatusUnit Component
 * 
 * Displays a summary of unit statuses with counts for each category.
 * Shows four status types: Tersedia (Available), Ditempati (Occupied),
 * Cleaning, and Maintenance with color-coded icons and backgrounds.
 * 
 * @param statusCounts - Object containing counts for each unit status
 * @param isLoading - Whether the data is currently loading
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.9, 5.10, 15.1
 */
export default function StatusUnit({ statusCounts, isLoading = false }: StatusUnitProps) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {/* Card Title */}
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Status Unit</h3>

            {/* Status Grid */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {statusItems.map((item) => {
                    const Icon = item.icon;
                    const count = statusCounts[item.key];

                    return (
                        <div
                            key={item.key}
                            className={`flex flex-col items-center justify-center rounded-lg p-4 ${item.bgClass}`}
                        >
                            {isLoading ? (
                                // Skeleton loader
                                <>
                                    <div className="mb-2 h-8 w-8 animate-pulse rounded-full bg-gray-300" />
                                    <div className="mb-1 h-4 w-16 animate-pulse rounded bg-gray-300" />
                                    <div className="h-6 w-12 animate-pulse rounded bg-gray-300" />
                                </>
                            ) : (
                                // Actual content
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
        </div>
    );
}
