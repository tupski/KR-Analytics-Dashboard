'use client';

import React from 'react';
import type { DashboardInsight } from '@/types/dashboard';

interface DashboardInsightSummaryProps {
    insights: DashboardInsight[];
}

/**
 * Severity config: icon color and background
 */
const SEVERITY_STYLES: Record<string, { dot: string; bg: string; border: string; label: string }> = {
    good: {
        dot: 'bg-green-500',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Baik',
    },
    info: {
        dot: 'bg-blue-500',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        label: 'Info',
    },
    warning: {
        dot: 'bg-amber-500',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        label: 'Perhatian',
    },
    critical: {
        dot: 'bg-red-500',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'Kritis',
    },
};

function TrendIcon({ trend }: { trend?: 'up' | 'down' | 'flat' }) {
    if (!trend) return null;
    switch (trend) {
        case 'up':
            return <span className="text-green-600 text-xs font-bold ml-1">↑</span>;
        case 'down':
            return <span className="text-red-600 text-xs font-bold ml-1">↓</span>;
        case 'flat':
            return <span className="text-gray-400 text-xs ml-1">→</span>;
    }
}

function InsightCard({ insight }: { insight: DashboardInsight }) {
    const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info;

    return (
        <div className={`flex items-start gap-3 rounded-lg border p-3 sm:p-4 ${style.bg} ${style.border}`}>
            {/* Severity dot */}
            <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {insight.title}
                    </h4>
                    <TrendIcon trend={insight.trend} />
                </div>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5 leading-relaxed">
                    {insight.description}
                </p>
            </div>
        </div>
    );
}

/**
 * DashboardInsightSummary Component
 *
 * Displays "Ringkasan Hari Ini" — a set of deterministic insights
 * generated from existing dashboard KPI data.
 *
 * Empty state: shows friendly message when no insights available.
 */
export default function DashboardInsightSummary({ insights }: DashboardInsightSummaryProps) {
    if (!insights || insights.length === 0) {
        return (
            <section>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                    Ringkasan Hari Ini
                </h2>
                <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                    <p className="text-sm text-gray-500">
                        Belum ada insight yang bisa ditampilkan untuk periode ini.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                Ringkasan Hari Ini
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} />
                ))}
            </div>
        </section>
    );
}
