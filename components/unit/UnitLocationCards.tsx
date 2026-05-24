'use client';

import type { LocationSummary } from '@/app/unit/actions';

interface UnitLocationCardsProps {
    summaries: LocationSummary[];
}

export default function UnitLocationCards({ summaries }: UnitLocationCardsProps) {
    const getOccupancyColor = (rate: number) => {
        if (rate >= 80) return { bar: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' };
        if (rate >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50' };
        return { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' };
    };

    if (summaries.length === 0) {
        return null;
    }

    return (
        <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Ringkasan Per Lokasi</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {summaries.map((summary) => {
                    const colors = getOccupancyColor(summary.occupancyRate);
                    return (
                        <div
                            key={summary.name}
                            className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium text-gray-900 text-sm truncate">{summary.name}</h3>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colors.text} ${colors.bg}`}>
                                    {summary.occupancyRate}%
                                </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-2 bg-gray-100 rounded-full mb-3">
                                <div
                                    className={`h-2 rounded-full transition-all ${colors.bar}`}
                                    style={{ width: `${Math.min(summary.occupancyRate, 100)}%` }}
                                />
                            </div>

                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{summary.occupiedToday} terisi</span>
                                <span>{summary.availableToday} tersedia</span>
                                <span>{summary.totalRooms} total</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
