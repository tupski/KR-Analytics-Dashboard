'use client';

import { useState } from 'react';
import { User, CheckCircle } from 'lucide-react';
import type { UnitItem, UnitDateFilter } from '@/app/(dashboard)/unit/actions';
import RoomDetailModal from '@/components/shared/RoomDetailModal';
import type { DateFilter } from '@/app/(dashboard)/laporan/actions';

interface UnitGridProps {
    units: UnitItem[];
    dateFilter: UnitDateFilter;
}

export default function UnitGrid({ units, dateFilter }: UnitGridProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selected, setSelected] = useState<{ location: string; room: string } | null>(null);

    // Group units by location
    const groupedUnits = units.reduce((acc, unit) => {
        if (!acc[unit.lokasi]) acc[unit.lokasi] = [];
        acc[unit.lokasi].push(unit);
        return acc;
    }, {} as Record<string, UnitItem[]>);

    if (units.length === 0) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <p className="text-gray-500">Tidak ada unit ditemukan.</p>
            </div>
        );
    }

    const openDetail = (unit: UnitItem) => {
        if (!unit.isOccupiedToday) return;
        setSelected({ location: unit.lokasi, room: unit.name });
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* View toggle */}
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                    Daftar Unit ({units.length})
                </h2>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                    >
                        Grid
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
                    >
                        List
                    </button>
                </div>
            </div>

            {/* Grouped by location */}
            {Object.entries(groupedUnits).map(([location, locationUnits]) => (
                <div key={location}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        {location}
                        <span className="text-gray-400 font-normal">({locationUnits.length} unit)</span>
                    </h3>

                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
                            {locationUnits.map((unit) => (
                                <UnitCard key={unit.id} unit={unit} onClick={() => openDetail(unit)} />
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium text-gray-600">Kamar</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-600">Tamu</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {locationUnits.map((unit) => (
                                        <tr
                                            key={unit.id}
                                            className={`hover:bg-gray-50 ${unit.isOccupiedToday ? 'cursor-pointer' : ''}`}
                                            onClick={() => openDetail(unit)}
                                        >
                                            <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{unit.name}</td>
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                {unit.isOccupiedToday ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                                                        <User className="w-3 h-3" /> Terisi
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                                                        <CheckCircle className="w-3 h-3" /> Tersedia
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                                                {unit.currentGuest || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ))}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-600">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-green-100 border border-green-300"></div>
                    <span>Tersedia</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-orange-100 border border-orange-300"></div>
                    <span>Terisi</span>
                </div>
                <span className="text-xs text-gray-400 ml-auto hidden sm:inline">
                    Klik unit terisi untuk lihat detail
                </span>
            </div>

            {/* Modal — reuse the laporan filter values (compatible) */}
            {selected && (
                <RoomDetailModal
                    location={selected.location}
                    room={selected.room}
                    filter={dateFilter as DateFilter}
                    onClose={() => setSelected(null)}
                    currentGuest={units.find(u => u.lokasi === selected.location && u.name === selected.room)?.currentGuest}
                />
            )}
        </div>
    );
}

function UnitCard({ unit, onClick }: { unit: UnitItem; onClick: () => void }) {
    const clickable = unit.isOccupiedToday;
    return (
        <button
            type="button"
            disabled={!clickable}
            onClick={onClick}
            className={`relative rounded-lg border p-3 text-left transition-shadow ${clickable ? 'hover:shadow-md cursor-pointer' : 'cursor-default'} ${unit.isOccupiedToday
                ? 'bg-orange-50 border-orange-200 hover:border-orange-300'
                : 'bg-green-50 border-green-200'}`}
            title={unit.isOccupiedToday ? `Tamu: ${unit.currentGuest} — klik untuk detail` : 'Tersedia'}
        >
            <div className="flex items-center justify-between mb-1">
                {unit.isOccupiedToday ? (
                    <User className="w-3.5 h-3.5 text-orange-600" />
                ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                )}
                {unit.isOccupiedToday && unit.occupancyCount && unit.occupancyCount > 1 && (
                    <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 rounded-full">
                        {unit.occupancyCount}x
                    </span>
                )}
            </div>
            <p className="text-xs font-semibold text-gray-900 truncate">{unit.name}</p>
            {unit.isOccupiedToday && unit.currentGuest && (
                <p className="text-[10px] text-gray-600 truncate mt-0.5">{unit.currentGuest}</p>
            )}
        </button>
    );
}
