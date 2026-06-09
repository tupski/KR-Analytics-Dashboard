'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

export type SemanticType = 'revenue' | 'booking' | 'occupancy' | 'neutral';

export interface ClickableKpiCardProps {
    icon: React.ReactNode;
    title: string;
    value: string | number;
    subtitle?: string;
    semanticType: SemanticType;
    onClick?: () => void;
    isLoading?: boolean;
}

// ─── Semantic Colors ─────────────────────────────────────────────

const SEMANTIC_COLORS: Record<SemanticType, {
    iconBg: string;
    iconColor: string;
    accentBorder: string;
    hoverBg: string;
}> = {
    revenue: {
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600',
        accentBorder: 'border-l-green-500',
        hoverBg: 'hover:bg-green-50/50',
    },
    booking: {
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600',
        accentBorder: 'border-l-purple-500',
        hoverBg: 'hover:bg-purple-50/50',
    },
    occupancy: {
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        accentBorder: 'border-l-blue-500',
        hoverBg: 'hover:bg-blue-50/50',
    },
    neutral: {
        iconBg: 'bg-gray-100',
        iconColor: 'text-gray-600',
        accentBorder: 'border-l-gray-400',
        hoverBg: 'hover:bg-gray-50/50',
    },
};

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

export default function ClickableKpiCard({
    icon,
    title,
    value,
    subtitle,
    semanticType,
    onClick,
    isLoading = false,
}: ClickableKpiCardProps) {
    const colors = SEMANTIC_COLORS[semanticType];

    if (isLoading) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                <Skeleton />
            </div>
        );
    }

    const content = (
        <div className={`bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm border-l-4 ${colors.accentBorder} ${colors.hoverBg} transition-colors`}>
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

                    {/* Value */}
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-0.5 whitespace-nowrap leading-none min-w-0">
                        {value}
                    </p>

                    {/* Subtitle */}
                    {subtitle && (
                        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                    )}
                </div>

                {/* Chevron indicator */}
                <div className="flex-shrink-0 self-center">
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
            </div>
        </div>
    );

    if (!onClick) {
        return content;
    }

    return (
        <button
            type="button"
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-xl cursor-pointer"
            aria-label={`${title}: ${value}. Klik untuk detail`}
        >
            {content}
        </button>
    );
}
