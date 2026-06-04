'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

// ─── Types ───────────────────────────────────────────────────────

export type SemanticType = 'revenue' | 'expense' | 'occupancy' | 'booking' | 'neutral';

export interface MetricCardHorizontalProps {
    icon: React.ReactNode;
    title: string;
    value: string | number;
    subtitle?: string;
    comparisonValue?: string | number;
    deltaAmount?: string | number;
    deltaPercentage?: number;
    trend?: 'up' | 'down' | 'flat';
    comparisonLabel?: string;
    isComparisonActive: boolean;
    semanticType: SemanticType;
    isLoading?: boolean;
}

// ─── Semantic Colors ─────────────────────────────────────────────

const SEMANTIC_COLORS: Record<SemanticType, {
    iconBg: string;
    iconColor: string;
    accentBorder: string;
}> = {
    revenue: {
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600',
        accentBorder: 'border-l-green-500',
    },
    expense: {
        iconBg: 'bg-red-50',
        iconColor: 'text-red-600',
        accentBorder: 'border-l-red-500',
    },
    occupancy: {
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        accentBorder: 'border-l-blue-500',
    },
    booking: {
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600',
        accentBorder: 'border-l-purple-500',
    },
    neutral: {
        iconBg: 'bg-gray-100',
        iconColor: 'text-gray-600',
        accentBorder: 'border-l-gray-400',
    },
};

// ─── Trend color logic ───────────────────────────────────────────

function isTrendGood(semanticType: SemanticType, trend: 'up' | 'down' | 'flat'): boolean | null {
    if (trend === 'flat') return null;
    switch (semanticType) {
        case 'revenue': return trend === 'up';      // revenue up = good
        case 'expense': return trend === 'down';     // expense down = good
        case 'occupancy': return trend === 'up';     // occupancy up = good
        case 'booking': return trend === 'up';       // bookings up = good
        case 'neutral': return null;
    }
}

function trendColor(isGood: boolean | null): string {
    if (isGood === null) return 'text-gray-500';
    return isGood ? 'text-green-600' : 'text-red-600';
}

// ─── Skeleton ────────────────────────────────────────────────────

function Skeleton() {
    return (
        <div className="flex items-center gap-3 sm:gap-4 animate-pulse">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-200" />
            <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-6 bg-gray-200 rounded w-32" />
                <div className="h-3 bg-gray-200 rounded w-20" />
            </div>
        </div>
    );
}

// ─── Component ───────────────────────────────────────────────────

export default function MetricCardHorizontal({
    icon,
    title,
    value,
    subtitle,
    comparisonValue,
    deltaAmount,
    deltaPercentage,
    trend = 'flat',
    comparisonLabel,
    isComparisonActive,
    semanticType,
    isLoading = false,
}: MetricCardHorizontalProps) {
    const colors = SEMANTIC_COLORS[semanticType];

    if (isLoading) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                <Skeleton />
            </div>
        );
    }

    const good = isTrendGood(semanticType, trend);
    const tColor = trendColor(good);
    const accentClass = isComparisonActive ? `border-l-4 ${colors.accentBorder}` : '';

    return (
        <div className={`bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm ${accentClass}`}>
            <div className="flex items-start gap-3 sm:gap-4">
                {/* Icon */}
                <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center ${colors.iconBg}`}>
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.iconColor}`}>
                        {icon}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Title */}
                    <p className="text-xs sm:text-sm text-gray-500 truncate">{title}</p>

                    {/* Value — whitespace-nowrap prevents "Jt/Rb/M" from wrapping to new line */}
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-0.5 whitespace-nowrap leading-none min-w-0">
                        {value}
                    </p>

                    {/* Subtitle */}
                    {subtitle && (
                        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                    )}

                    {/* Comparison info */}
                    {isComparisonActive && (comparisonValue != null || deltaAmount != null) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            {comparisonLabel && (
                                <span className="text-gray-500">{comparisonLabel}:</span>
                            )}
                            {comparisonValue != null && (
                                <span className="text-gray-700 font-medium">{comparisonValue}</span>
                            )}
                            {deltaAmount != null && (
                                <span className={`inline-flex items-center gap-0.5 font-medium ${tColor}`}>
                                    {trend === 'up' && <TrendingUp className="w-3 h-3" />}
                                    {trend === 'down' && <TrendingDown className="w-3 h-3" />}
                                    {trend === 'flat' && <Minus className="w-3 h-3" />}
                                    <span>{deltaAmount}</span>
                                    {deltaPercentage != null && (
                                        <span className="opacity-75">
                                            ({deltaPercentage >= 0 ? '+' : ''}{deltaPercentage.toFixed(1)}%)
                                        </span>
                                    )}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
