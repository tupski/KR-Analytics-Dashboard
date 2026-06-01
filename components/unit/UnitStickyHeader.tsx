'use client';

import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';

interface Props {
    locations: string[];
    currentLocation: string;
}

/**
 * UnitStickyHeader — simplified to location filter only.
 * Date filter moved to StickyComparisonBar.
 */
export default function UnitStickyHeader({ locations, currentLocation }: Props) {
    const router = useRouter();

    const onLocationChange = (location: string) => {
        const params = new URLSearchParams();
        if (location) params.set('location', location);
        const qs = params.toString();
        router.push(qs ? `/unit?${qs}` : '/unit');
    };

    return (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Location filter */}
                <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-sm text-gray-500 font-medium">Lokasi:</span>
                    <select
                        value={currentLocation}
                        onChange={(e) => onLocationChange(e.target.value)}
                        className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
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
