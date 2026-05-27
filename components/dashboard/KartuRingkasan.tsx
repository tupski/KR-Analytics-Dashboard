'use client';

import React from 'react';
import Link from 'next/link';
import { formatCurrency, formatPercentage } from '@/lib/utils/format';

/**
 * KartuRingkasan (KPI Card) Component
 *
 * Displays a single KPI metric with value, label, icon, and optional trend indicator.
 * Supports loading states, error states, and Indonesian locale formatting.
 *
 */

interface TrendData {
    value: number;
    isPositive: boolean;
}

interface KartuRingkasanProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    href?: string;
    trend?: TrendData;
    isLoading?: boolean;
    error?: string;
    onRetry?: () => void;
}

/**
 * Format value based on type (currency, percentage, or plain number)
 */
function formatValue(value: string | number): string {
    if (typeof value === 'string') {
        return value;
    }

    // If value is a number, return as-is (caller should pre-format)
    return value.toString();
}

/**
 * Skeleton loader component for loading state
 */
function SkeletonLoader() {
    return (
        <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
            <div className="h-8 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-16"></div>
        </div>
    );
}

/**
 * Error state component with retry button
 */
function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
    return (
        <div className="text-center">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                    Coba Lagi
                </button>
            )}
        </div>
    );
}

/**
 * Trend indicator component
 */
function TrendIndicator({ trend }: { trend: TrendData }) {
    const trendColor = trend.isPositive ? 'text-green-600' : 'text-red-600';
    const trendIcon = trend.isPositive ? '↑' : '↓';
    const trendSign = trend.isPositive ? '+' : '';

    return (
        <div className={`flex items-center text-xs sm:text-sm ${trendColor}`}>
            <span className="mr-0.5 sm:mr-1">{trendIcon}</span>
            <span>{trendSign}{trend.value.toFixed(2)}%</span>
        </div>
    );
}

/**
 * KartuRingkasan Component
 */
export default function KartuRingkasan({
    title,
    value,
    icon,
    href,
    trend,
    isLoading = false,
    error,
    onRetry,
}: KartuRingkasanProps) {
    const cardContent = (
        <div className={`bg-white rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 hover:shadow-lg transition-shadow duration-200 ${href ? 'cursor-pointer' : ''}`}>
            {/* Icon Section */}
            <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                    {icon}
                </div>
                {trend && !isLoading && !error && (
                    <TrendIndicator trend={trend} />
                )}
            </div>

            {/* Content Section */}
            <div className="min-h-[64px] sm:min-h-[80px]">
                {isLoading ? (
                    <SkeletonLoader />
                ) : error ? (
                    <ErrorState error={error} onRetry={onRetry} />
                ) : (
                    <>
                        <h3 className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-2">{title}</h3>
                        <p className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 break-words">
                            {formatValue(value)}
                        </p>
                    </>
                )}
            </div>
        </div>
    );

    if (href) {
        return <Link href={href}>{cardContent}</Link>;
    }

    return cardContent;
}

// Re-export helper functions from shared utilities for backward compatibility
export { formatCurrency, formatPercentage } from '@/lib/utils/format';
