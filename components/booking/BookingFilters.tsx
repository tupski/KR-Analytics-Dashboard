'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { Search, Filter, X } from 'lucide-react';

interface BookingFiltersProps {
    locations: string[];
    currentSearch: string;
    currentLocation: string;
    currentDateFrom: string;
    currentDateTo: string;
}

export default function BookingFilters({
    locations,
    currentSearch,
    currentLocation,
    currentDateFrom,
    currentDateTo,
}: BookingFiltersProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [search, setSearch] = useState(currentSearch);
    const [location, setLocation] = useState(currentLocation);
    const [dateFrom, setDateFrom] = useState(currentDateFrom);
    const [dateTo, setDateTo] = useState(currentDateTo);

    const applyFilters = useCallback(() => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (location) params.set('location', location);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        params.set('page', '1');
        router.push(`/booking?${params.toString()}`);
    }, [search, location, dateFrom, dateTo, router]);

    const clearFilters = useCallback(() => {
        setSearch('');
        setLocation('');
        setDateFrom('');
        setDateTo('');
        router.push('/booking');
    }, [router]);

    const hasFilters = search || location || dateFrom || dateTo;

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-2 sm:gap-3">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Cari nama tamu atau nomor kamar..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                        className="w-full pl-10 pr-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>

                {/* Location */}
                <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white min-w-0"
                >
                    <option value="">Semua Lokasi</option>
                    {locations.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                    ))}
                </select>

                {/* Date row — 2-col on mobile to save space */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:contents">
                    {/* Date From */}
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-0"
                        placeholder="Dari tanggal"
                    />

                    {/* Date To */}
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-0"
                        placeholder="Sampai tanggal"
                    />
                </div>

                {/* Action buttons row */}
                <div className="flex gap-2 sm:gap-3">
                    {/* Apply Button */}
                    <button
                        onClick={applyFilters}
                        className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex-1 lg:flex-none"
                    >
                        <Filter className="w-4 h-4" />
                        Filter
                    </button>

                    {/* Clear Button */}
                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                        >
                            <X className="w-4 h-4" />
                            Reset
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
