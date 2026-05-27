/**
 * 🗑️ SAFE TO REMOVE — Verified unused as of 2026-05-27 audit.
 * This file is dead code. No imports reference it.
 * Awaiting approval before deletion.
 */

'use client';

/**
 * DateRangeComparison - Reusable comparison mode component
 *
 * Features:
 * - Toggle comparison mode on/off
 * - Two date range selectors (primary vs comparison)
 * - Quick presets (This Month vs Last Month, This Week vs Last Week, etc.)
 * - Modern UI with clear visual distinction
 */

import { useState } from 'react';
import { Calendar, ArrowLeftRight, X } from 'lucide-react';

export interface DateRange {
    start: Date;
    end: Date;
    label?: string;
}

export interface ComparisonData {
    enabled: boolean;
    primary: DateRange;
    comparison?: DateRange;
}

interface DateRangeComparisonProps {
    value: ComparisonData;
    onChange: (data: ComparisonData) => void;
    className?: string;
}

// Quick preset options
const PRESETS = [
    {
        id: 'month-vs-last',
        label: 'Bulan Ini vs Bulan Lalu',
        getPrimary: () => {
            const now = new Date();
            return {
                start: new Date(now.getFullYear(), now.getMonth(), 1),
                end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
                label: 'Bulan Ini',
            };
        },
        getComparison: () => {
            const now = new Date();
            return {
                start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
                end: new Date(now.getFullYear(), now.getMonth(), 0),
                label: 'Bulan Lalu',
            };
        },
    },
    {
        id: 'week-vs-last',
        label: 'Minggu Ini vs Minggu Lalu',
        getPrimary: () => {
            const now = new Date();
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
            const monday = new Date(now.setDate(diff));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return {
                start: new Date(monday.setHours(0, 0, 0, 0)),
                end: new Date(sunday.setHours(23, 59, 59, 999)),
                label: 'Minggu Ini',
            };
        },
        getComparison: () => {
            const now = new Date();
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7; // Last Monday
            const monday = new Date(now.setDate(diff));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return {
                start: new Date(monday.setHours(0, 0, 0, 0)),
                end: new Date(sunday.setHours(23, 59, 59, 999)),
                label: 'Minggu Lalu',
            };
        },
    },
    {
        id: 'quarter-vs-last',
        label: 'Kuartal Ini vs Kuartal Lalu',
        getPrimary: () => {
            const now = new Date();
            const quarter = Math.floor(now.getMonth() / 3);
            return {
                start: new Date(now.getFullYear(), quarter * 3, 1),
                end: new Date(now.getFullYear(), quarter * 3 + 3, 0),
                label: `Q${quarter + 1} ${now.getFullYear()}`,
            };
        },
        getComparison: () => {
            const now = new Date();
            const quarter = Math.floor(now.getMonth() / 3);
            const prevQuarter = quarter === 0 ? 3 : quarter - 1;
            const year = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
            return {
                start: new Date(year, prevQuarter * 3, 1),
                end: new Date(year, prevQuarter * 3 + 3, 0),
                label: `Q${prevQuarter + 1} ${year}`,
            };
        },
    },
    {
        id: 'year-vs-last',
        label: 'Tahun Ini vs Tahun Lalu',
        getPrimary: () => {
            const now = new Date();
            return {
                start: new Date(now.getFullYear(), 0, 1),
                end: new Date(now.getFullYear(), 11, 31),
                label: `${now.getFullYear()}`,
            };
        },
        getComparison: () => {
            const now = new Date();
            return {
                start: new Date(now.getFullYear() - 1, 0, 1),
                end: new Date(now.getFullYear() - 1, 11, 31),
                label: `${now.getFullYear() - 1}`,
            };
        },
    },
];

function formatDate(date: Date): string {
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DateRangeComparison({ value, onChange, className = '' }: DateRangeComparisonProps) {
    const [showPresets, setShowPresets] = useState(false);

    const handleToggle = () => {
        if (value.enabled) {
            // Disable comparison
            onChange({ ...value, enabled: false, comparison: undefined });
        } else {
            // Enable with default preset (month vs last month)
            const preset = PRESETS[0];
            onChange({
                enabled: true,
                primary: preset.getPrimary(),
                comparison: preset.getComparison(),
            });
        }
    };

    const handlePresetSelect = (preset: typeof PRESETS[0]) => {
        onChange({
            enabled: true,
            primary: preset.getPrimary(),
            comparison: preset.getComparison(),
        });
        setShowPresets(false);
    };

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Toggle Button */}
            <div className="flex items-center justify-between">
                <button
                    onClick={handleToggle}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${value.enabled
                            ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                >
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>{value.enabled ? 'Mode Bandingkan Aktif' : 'Bandingkan Periode'}</span>
                </button>

                {value.enabled && (
                    <button
                        onClick={() => setShowPresets(!showPresets)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Preset Cepat</span>
                    </button>
                )}
            </div>

            {/* Presets Dropdown */}
            {value.enabled && showPresets && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset.id}
                            onClick={() => handlePresetSelect(preset)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-md transition-colors"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Date Range Display */}
            {value.enabled && value.comparison && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Primary Range */}
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                {value.primary.label || 'Periode Utama'}
                            </span>
                            <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                        </div>
                        <div className="text-sm text-gray-700">
                            <div className="font-medium">{formatDate(value.primary.start)}</div>
                            <div className="text-xs text-gray-500">sampai</div>
                            <div className="font-medium">{formatDate(value.primary.end)}</div>
                        </div>
                    </div>

                    {/* Comparison Range */}
                    <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                {value.comparison.label || 'Periode Pembanding'}
                            </span>
                            <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                        </div>
                        <div className="text-sm text-gray-700">
                            <div className="font-medium">{formatDate(value.comparison.start)}</div>
                            <div className="text-xs text-gray-500">sampai</div>
                            <div className="font-medium">{formatDate(value.comparison.end)}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Info Text */}
            {value.enabled && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>Data akan ditampilkan dalam mode perbandingan. Grafik dan metrik akan menunjukkan kedua periode.</span>
                </p>
            )}
        </div>
    );
}

/**
 * Helper hook to use comparison data in your pages
 * 
 * Example usage:
 * ```tsx
 * const [comparison, setComparison] = useComparisonMode();
 * 
 * // In your component:
 * <DateRangeComparison value={comparison} onChange={setComparison} />
 * 
 * // Use comparison.enabled to conditionally fetch/display data
 * if (comparison.enabled && comparison.comparison) {
 *   // Fetch data for both periods
 *   const primaryData = await fetchData(comparison.primary.start, comparison.primary.end);
 *   const comparisonData = await fetchData(comparison.comparison.start, comparison.comparison.end);
 * }
 * ```
 */
export function useComparisonMode(): [ComparisonData, (data: ComparisonData) => void] {
    const [data, setData] = useState<ComparisonData>({
        enabled: false,
        primary: {
            start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
        },
    });

    return [data, setData];
}
