'use client';

import { useState, useEffect, useRef } from 'react';
import { GitCompareArrows, Calendar } from 'lucide-react';
import {
    format,
    subDays,
    subWeeks,
    subMonths,
    subYears,
    differenceInDays,
    startOfDay,
    endOfDay,
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// ─── Types ───────────────────────────────────────────────────────
export type ComparisonMode =
    | 'none'
    | 'previousPeriod'
    | 'previousWeek'
    | 'previousMonth'
    | 'previousYear'
    | 'custom';

export interface DateRange {
    from: Date;
    to: Date;
}

export interface ComparisonFilterProps {
    mode: ComparisonMode;
    onChange: (mode: ComparisonMode) => void;
    currentRange: DateRange;
    customRange?: DateRange;
    onCustomRangeChange?: (range: DateRange) => void;
}

// ─── Labels ──────────────────────────────────────────────────────
const MODE_LABELS: Record<ComparisonMode, string> = {
    none: 'Tidak dibandingkan',
    previousPeriod: 'Periode sebelumnya',
    previousWeek: 'Minggu sebelumnya',
    previousMonth: 'Bulan sebelumnya',
    previousYear: 'Tahun sebelumnya',
    custom: 'Custom',
};

// ─── Helpers ─────────────────────────────────────────────────────
export function getComparisonRange(
    mode: ComparisonMode,
    currentRange: DateRange,
    customRange?: DateRange
): DateRange | null {
    if (mode === 'none') return null;

    const duration = currentRange.to.getTime() - currentRange.from.getTime();
    const durationDays = differenceInDays(currentRange.to, currentRange.from);

    switch (mode) {
        case 'previousPeriod': {
            // Same length, shifted back by the duration
            const compTo = new Date(currentRange.from.getTime() - 86400000); // -1 day
            const compFrom = new Date(compTo.getTime() - duration);
            return {
                from: startOfDay(compFrom),
                to: endOfDay(compTo),
            };
        }
        case 'previousWeek': {
            const compTo = subWeeks(currentRange.to, 1);
            const compFrom = subWeeks(currentRange.from, 1);
            return { from: startOfDay(compFrom), to: endOfDay(compTo) };
        }
        case 'previousMonth': {
            const compTo = subMonths(currentRange.to, 1);
            const compFrom = subMonths(currentRange.from, 1);
            return { from: startOfDay(compFrom), to: endOfDay(compTo) };
        }
        case 'previousYear': {
            const compTo = subYears(currentRange.to, 1);
            const compFrom = subYears(currentRange.from, 1);
            return { from: startOfDay(compFrom), to: endOfDay(compTo) };
        }
        case 'custom':
            return customRange || null;
        default:
            return null;
    }
}

export function calculateDelta(current: number, previous: number): {
    amount: number;
    percentage: number;
    trend: 'up' | 'down' | 'same';
} {
    const amount = current - previous;
    const percentage = previous !== 0 ? (amount / Math.abs(previous)) * 100 : 0;
    const trend = amount > 0 ? 'up' : amount < 0 ? 'down' : 'same';
    return { amount, percentage, trend };
}

// ─── Delta Display Component ─────────────────────────────────────
interface DeltaDisplayProps {
    current: number;
    previous: number;
    prefix?: string;
    suffix?: string;
    inverseGood?: boolean; // For metrics where lower is better (expenses)
    formatValue?: (value: number) => string;
}

export function DeltaDisplay({
    current,
    previous,
    prefix = '',
    suffix = '',
    inverseGood = false,
    formatValue,
}: DeltaDisplayProps) {
    const delta = calculateDelta(current, previous);
    const isGood = inverseGood ? delta.trend === 'down' : delta.trend === 'up';
    const fmt = formatValue || ((v: number) => v.toLocaleString('id-ID'));

    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="text-lg sm:text-xl font-bold text-gray-900">
                {prefix}{fmt(current)}{suffix}
            </span>
            <div className="flex items-center gap-1">
                <span
                    className={`text-xs sm:text-sm font-medium flex items-center gap-0.5 ${delta.trend === 'same'
                        ? 'text-gray-400'
                        : isGood
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                >
                    {delta.trend === 'up' && '↑'}
                    {delta.trend === 'down' && '↓'}
                    {delta.trend === 'same' && '→'}
                    {delta.amount > 0 ? '+' : ''}{fmt(delta.amount)}{suffix}
                    <span className="text-[10px] sm:text-xs opacity-75">
                        ({delta.percentage > 0 ? '+' : ''}{delta.percentage.toFixed(1)}%)
                    </span>
                </span>
            </div>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────
export default function ComparisonFilter({
    mode,
    onChange,
    currentRange,
    customRange,
    onCustomRangeChange,
}: ComparisonFilterProps) {
    const [openDropdown, setOpenDropdown] = useState(false);
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleModeChange = (m: ComparisonMode) => {
        onChange(m);
        setOpenDropdown(false);
        if (m === 'custom') {
            setShowCustomPicker(true);
        } else {
            setShowCustomPicker(false);
        }
    };

    const handleCustomApply = () => {
        if (customFrom && customTo && onCustomRangeChange) {
            onCustomRangeChange({
                from: startOfDay(new Date(customFrom)),
                to: endOfDay(new Date(customTo)),
            });
            onChange('custom');
            setShowCustomPicker(false);
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpenDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const comparisonRange = getComparisonRange(mode, currentRange, customRange);

    return (
        <div className="relative overflow-visible" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setOpenDropdown(!openDropdown)}
                className={`
                    inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors
                    ${mode !== 'none'
                        ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }
                `}
            >
                <GitCompareArrows className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">
                    {MODE_LABELS[mode]}
                </span>
                <span className="sm:hidden">Bandingkan</span>
            </button>

            {/* Dropdown */}
            {openDropdown && (
                <div className="absolute z-[60] mt-2 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[220px]">
                    {(Object.keys(MODE_LABELS) as ComparisonMode[]).map(m => (
                        <button
                            type="button"
                            key={m}
                            onClick={() => handleModeChange(m)}
                            className={`
                                w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2
                                ${mode === m ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}
                            `}
                        >
                            {m !== 'none' && <GitCompareArrows className="w-3.5 h-3.5 text-gray-400" />}
                            {MODE_LABELS[m]}
                        </button>
                    ))}
                </div>
            )}

            {/* Custom Date Picker */}
            {showCustomPicker && (
                <div className="absolute z-[60] mt-2 bg-white border border-gray-200 rounded-xl shadow-xl p-4 min-w-[280px]">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Pilih Periode Pembanding</h4>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Dari</label>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Sampai</label>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { setShowCustomPicker(false); onChange('none'); }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleCustomApply}
                                disabled={!customFrom || !customTo}
                                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Terapkan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comparison Range Display */}
            {comparisonRange && mode !== 'none' && (
                <div className="mt-2 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                    <span className="font-medium">Pembanding:</span>{' '}
                    {format(comparisonRange.from, 'dd MMM yyyy')} – {format(comparisonRange.to, 'dd MMM yyyy')}
                </div>
            )}
        </div>
    );
}
