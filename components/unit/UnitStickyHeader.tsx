'use client';

import { useRouter } from 'next/navigation';
import { Calendar, MapPin } from 'lucide-react';
import type { UnitDateFilter } from '@/app/(dashboard)/unit/actions';

interface Props {
    locations: string[];
    currentLocation: string;
    currentFilter: UnitDateFilter;
    dateLabel: string;
}

const FILTERS: { value: UnitDateFilter; label: string }[] = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'yesterday', label: 'Kemarin' },
    { value: '7days', label: '7 Hari' },
    { value: 'month', label: 'Bulan Ini' },
    { value: 'year', label: 'Tahun Ini' },
];

export default function UnitStickyHeader({ locations, currentLocation, currentFilter, dateLabel }: Props) {
    const router = useRouter();

    const buildUrl = (filter: UnitDateFilter, location: string) => {
        const params = new URLSearchParams();
        if (location) params.set('location', location);
        if (filter !== 'today') params.set('filter', filter);
        const qs = params.toString();
        return qs ? `/unit?${qs}` : '/unit';
    };

    const onFilterChange = (filter: UnitDateFilter) => {
        router.push(buildUrl(filter, currentLocation));
    };

    const onLocationChange = (location: string) => {
        router.push(buildUrl(currentFilter, location));
    };

    return (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Active filter summary */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        {dateLabel}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium">
                        <MapPin className="w-3.5 h-3.5" />
                        {currentLocation || 'Semua Lokasi'}
                    </span>
                </div>

                {/* Date filter pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {FILTERS.map(f => (
                        <button
                            key={f.value}
                            onClick={() => onFilterChange(f.value)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${currentFilter === f.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
                        >
                            {f.label}
                        </button>
                    ))}

                    <select
                        value={currentLocation}
                        onChange={(e) => onLocationChange(e.target.value)}
                        className="ml-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                        aria-label="Filter lokasi"
                    >
                        <option value="">Semua Lokasi</option>
                        {locations.map((loc) => (
                            <option key={loc} value={loc}>{loc}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
