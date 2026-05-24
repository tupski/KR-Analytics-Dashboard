'use client';

import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';

interface UnitLocationFilterProps {
    locations: string[];
    currentLocation: string;
}

export default function UnitLocationFilter({ locations, currentLocation }: UnitLocationFilterProps) {
    const router = useRouter();

    const handleChange = (location: string) => {
        if (location) {
            router.push(`/unit?location=${encodeURIComponent(location)}`);
        } else {
            router.push('/unit');
        }
    };

    return (
        <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-gray-500" />
            <select
                value={currentLocation}
                onChange={(e) => handleChange(e.target.value)}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
                <option value="">Semua Lokasi</option>
                {locations.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                ))}
            </select>
            {currentLocation && (
                <button
                    onClick={() => handleChange('')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                    Reset
                </button>
            )}
        </div>
    );
}
