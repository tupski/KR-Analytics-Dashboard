'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
    format,
    startOfDay,
    endOfDay,
    subDays,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    eachDayOfInterval,
    getDay,
    subWeeks,
    subMonths,
    subYears,
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// ─── Types ───────────────────────────────────────────────────────
export type DatePreset =
    | 'today'
    | 'yesterday'
    | 'last7days'
    | 'last30days'
    | 'thisWeek'
    | 'lastWeek'
    | 'thisMonth'
    | 'lastMonth'
    | 'thisYear'
    | 'custom';

export interface DateRangeValue {
    from: Date;
    to: Date;
}

export interface DateRangePickerProps {
    value: DateRangeValue;
    onChange: (range: DateRangeValue) => void;
    preset?: DatePreset;
    onPresetChange?: (preset: DatePreset) => void;
    showPresets?: boolean;
    showCalendar?: boolean;
    mode?: 'calendar_day' | 'hotel_day';
    className?: string;
}

// ─── Preset Labels (Indonesian) ──────────────────────────────────
const PRESET_LABELS: Record<DatePreset, string> = {
    today: 'Hari ini',
    yesterday: 'Kemarin',
    last7days: '7 hari terakhir',
    last30days: '30 hari terakhir',
    thisWeek: 'Minggu ini',
    lastWeek: 'Minggu lalu',
    thisMonth: 'Bulan ini',
    lastMonth: 'Bulan lalu',
    thisYear: 'Tahun ini',
    custom: 'Custom',
};

// ─── Helpers ─────────────────────────────────────────────────────
/**
 * Get date range from preset
 */
export function getDateRangeFromPreset(preset: DatePreset, referenceDate?: Date): DateRangeValue {
    const now = referenceDate || new Date();
    const today = startOfDay(now);

    switch (preset) {
        case 'today':
            return { from: today, to: endOfDay(today) };
        case 'yesterday':
            const yesterday = subDays(today, 1);
            return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
        case 'last7days':
            return { from: startOfDay(subDays(today, 6)), to: endOfDay(today) };
        case 'last30days':
            return { from: startOfDay(subDays(today, 29)), to: endOfDay(today) };
        case 'thisWeek':
            return { from: startOfWeek(today, { locale: localeId }), to: endOfDay(today) };
        case 'lastWeek': {
            const prevWeekStart = startOfWeek(subWeeks(today, 1), { locale: localeId });
            const prevWeekEnd = endOfWeek(prevWeekStart, { locale: localeId });
            return { from: prevWeekStart, to: prevWeekEnd };
        }
        case 'thisMonth':
            return { from: startOfMonth(today), to: endOfDay(today) };
        case 'lastMonth': {
            const lastMonthEnd = endOfMonth(subMonths(today, 1));
            return { from: startOfMonth(subMonths(today, 1)), to: lastMonthEnd };
        }
        case 'thisYear':
            return { from: startOfYear(today), to: endOfDay(today) };
        case 'custom':
            return { from: today, to: endOfDay(today) };
    }
}

/**
 * Detect which preset matches the given range
 */
export function detectPreset(range: DateRangeValue): DatePreset | null {
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    const sameTime = (a: number, b: number) => a === b;

    if (sameTime(range.from.getTime(), todayStart.getTime()) &&
        sameTime(range.to.getTime(), todayEnd.getTime())) {
        return 'today';
    }

    const yesterday = subDays(today, 1);
    const yesterdayStart = startOfDay(yesterday);
    const yesterdayEnd = endOfDay(yesterday);
    if (sameTime(range.from.getTime(), yesterdayStart.getTime()) &&
        sameTime(range.to.getTime(), yesterdayEnd.getTime())) {
        return 'yesterday';
    }

    const last7Start = startOfDay(subDays(today, 6));
    if (sameTime(range.from.getTime(), last7Start.getTime()) &&
        sameTime(range.to.getTime(), todayEnd.getTime())) {
        return 'last7days';
    }

    const last30Start = startOfDay(subDays(today, 29));
    if (sameTime(range.from.getTime(), last30Start.getTime()) &&
        sameTime(range.to.getTime(), todayEnd.getTime())) {
        return 'last30days';
    }

    const weekStart = startOfWeek(today, { locale: localeId });
    if (sameTime(range.from.getTime(), weekStart.getTime()) &&
        sameTime(range.to.getTime(), todayEnd.getTime())) {
        return 'thisWeek';
    }

    const monthStart = startOfMonth(today);
    if (sameTime(range.from.getTime(), monthStart.getTime()) &&
        sameTime(range.to.getTime(), todayEnd.getTime())) {
        return 'thisMonth';
    }

    const lastMonthStart = startOfMonth(subMonths(today, 1));
    const lastMonthEnd = endOfMonth(subMonths(today, 1));
    if (sameTime(range.from.getTime(), lastMonthStart.getTime()) &&
        sameTime(range.to.getTime(), lastMonthEnd.getTime())) {
        return 'lastMonth';
    }

    const yearStart = startOfYear(today);
    if (sameTime(range.from.getTime(), yearStart.getTime()) &&
        sameTime(range.to.getTime(), todayEnd.getTime())) {
        return 'thisYear';
    }

    return null;
}

/**
 * Format range for display
 */
export function formatRangeDisplay(range: DateRangeValue): string {
    const fromStr = format(range.from, 'dd MMM yyyy');
    const toStr = format(range.to, 'dd MMM yyyy');
    if (fromStr === toStr) return fromStr;
    return `${fromStr} – ${toStr}`;
}

// ─── Mini Calendar Component ─────────────────────────────────────
interface MiniCalendarProps {
    selected: { from: Date | null; to: Date | null };
    onSelect: (date: Date) => void;
    onClose: () => void;
}

function MiniCalendar({ selected, onSelect, onClose }: MiniCalendarProps) {
    const [viewDate, setViewDate] = useState(new Date());
    const containerRef = useRef<HTMLDivElement>(null);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = getDay(firstDay); // 0=Sun
    const daysInMonth = lastDay.getDate();

    // Build calendar grid
    const days: (number | null)[] = [];
    // Adjust for Monday start (Indonesian convention)
    const offset = startDay === 0 ? 6 : startDay - 1;
    for (let i = 0; i < offset; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);

    const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

    const isInRange = (date: Date): boolean => {
        if (!selected.from || !selected.to) return false;
        const t = date.getTime();
        return t >= selected.from.getTime() && t <= selected.to.getTime();
    };

    const isStart = (date: Date): boolean =>
        selected.from ? date.getTime() === selected.from.getTime() : false;

    const isEnd = (date: Date): boolean =>
        selected.to ? date.getTime() === selected.to.getTime() : false;

    const isToday = (date: Date): boolean => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={containerRef}
            className="absolute z-50 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl p-4 min-w-[280px]"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <button
                    onClick={() => setViewDate(new Date(year, month - 1, 1))}
                    className="p-1 hover:bg-gray-100 rounded"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-gray-900">
                    {format(viewDate, 'MMMM yyyy', { locale: localeId })}
                </span>
                <button
                    onClick={() => setViewDate(new Date(year, month + 1, 1))}
                    className="p-1 hover:bg-gray-100 rounded"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Day names */}
            <div className="grid grid-cols-7 gap-1 mb-1">
                {dayNames.map(d => (
                    <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">
                        {d}
                    </div>
                ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => {
                    if (day === null) return <div key={`empty-${i}`} />;
                    const date = new Date(year, month, day);
                    const inRange = isInRange(date);
                    const start = isStart(date);
                    const end = isEnd(date);
                    const today = isToday(date);

                    return (
                        <button
                            key={i}
                            onClick={() => onSelect(date)}
                            className={`
                                relative w-8 h-8 text-xs rounded-full flex items-center justify-center transition-colors
                                ${start || end ? 'bg-blue-600 text-white font-semibold' : ''}
                                ${inRange && !start && !end ? 'bg-blue-100 text-blue-900' : ''}
                                ${!inRange && !start && !end ? 'hover:bg-gray-100 text-gray-700' : ''}
                                ${today && !start && !end ? 'ring-2 ring-blue-400' : ''}
                            `}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>

            {/* Selection info */}
            {selected.from && selected.to && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 text-center">
                    {format(selected.from, 'dd MMM')} – {format(selected.to, 'dd MMM yyyy')}
                </div>
            )}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────
export default function DateRangePicker({
    value,
    onChange,
    preset,
    onPresetChange,
    showPresets = true,
    showCalendar = true,
    mode = 'calendar_day',
    className = '',
}: DateRangePickerProps) {
    const [openCalendar, setOpenCalendar] = useState(false);
    const [calendarSelection, setCalendarSelection] = useState<{ from: Date | null; to: Date | null }>({
        from: null,
        to: null,
    });
    const [openDropdown, setOpenDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentPreset = preset || detectPreset(value);

    const handlePresetClick = (p: DatePreset) => {
        const range = getDateRangeFromPreset(p);
        onChange(range);
        onPresetChange?.(p);
        setOpenDropdown(false);
    };

    const handleCalendarSelect = (date: Date) => {
        const d = startOfDay(date);
        if (!calendarSelection.from || (calendarSelection.from && calendarSelection.to)) {
            // Start new selection
            setCalendarSelection({ from: d, to: null });
        } else {
            // Complete selection
            const from = calendarSelection.from;
            const to = d;
            if (from.getTime() <= to.getTime()) {
                setCalendarSelection({ from, to: endOfDay(to) });
                onChange({ from, to: endOfDay(to) });
                onPresetChange?.('custom');
                setOpenCalendar(false);
            } else {
                setCalendarSelection({ from: to, to: endOfDay(from) });
                onChange({ from: to, to: endOfDay(from) });
                onPresetChange?.('custom');
                setOpenCalendar(false);
            }
        }
    };

    const openCalendarPicker = () => {
        setCalendarSelection({ from: value.from, to: value.to });
        setOpenCalendar(true);
        setOpenDropdown(false);
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

    return (
        <div className={`relative ${className}`}>
            {/* Trigger Button */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setOpenDropdown(!openDropdown)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="hidden sm:inline font-medium">{formatRangeDisplay(value)}</span>
                    <span className="sm:hidden">{format(value.from, 'dd MMM')}</span>
                </button>

                {showCalendar && (
                    <button
                        onClick={openCalendarPicker}
                        className="p-2 bg-white border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                        title="Pilih tanggal custom"
                    >
                        <Calendar className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Presets Dropdown */}
            {openDropdown && showPresets && (
                <div
                    ref={dropdownRef}
                    className="absolute z-40 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[200px]"
                >
                    {(Object.keys(PRESET_LABELS) as DatePreset[]).map(p => (
                        <button
                            key={p}
                            onClick={() => handlePresetClick(p)}
                            className={`
                                w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors
                                ${currentPreset === p ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}
                            `}
                        >
                            {PRESET_LABELS[p]}
                        </button>
                    ))}
                    {showCalendar && (
                        <>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                                onClick={openCalendarPicker}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                            >
                                📅 Pilih tanggal...
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Mini Calendar */}
            {openCalendar && (
                <MiniCalendar
                    selected={calendarSelection}
                    onSelect={handleCalendarSelect}
                    onClose={() => setOpenCalendar(false)}
                />
            )}
        </div>
    );
}
