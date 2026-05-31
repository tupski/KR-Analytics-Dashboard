'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import type { DashboardInsight } from '@/types/dashboard';

// ─── Severity styles (mirrors DashboardInsightSummary) ──────────
const SEVERITY_STYLES: Record<string, { dot: string }> = {
    good: { dot: 'bg-green-500' },
    info: { dot: 'bg-blue-500' },
    warning: { dot: 'bg-amber-500' },
    critical: { dot: 'bg-red-500' },
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

interface AIInsightsExpandableProps {
    insights: DashboardInsight[];
    maxVisible?: number;
}

/**
 * AIInsightsExpandable — Collapsible card showing deterministic AI insights.
 * Shows `maxVisible` lines by default (default: 3) with a "Lihat Selengkapnya" toggle.
 */
export default function AIInsightsExpandable({
    insights,
    maxVisible = 3,
}: AIInsightsExpandableProps) {
    const [expanded, setExpanded] = useState(false);

    if (!insights || insights.length === 0) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <Sparkles className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                    Belum ada insight yang bisa ditampilkan.
                </p>
            </div>
        );
    }

    const visibleInsights = expanded ? insights : insights.slice(0, maxVisible);
    const hasMore = insights.length > maxVisible;

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-900">AI Insights</h3>
                    <span className="text-xs text-gray-400">({insights.length})</span>
                </div>
            </div>

            {/* Insight lines */}
            <div className="divide-y divide-gray-50">
                {visibleInsights.map((insight) => {
                    const style = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.info;
                    return (
                        <div key={insight.id} className="flex items-start gap-3 px-4 py-3">
                            <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                    <span className="text-sm font-medium text-gray-800 truncate">
                                        {insight.title}
                                    </span>
                                    <TrendIcon trend={insight.trend} />
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                                    {insight.description}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Expand/collapse toggle */}
            {hasMore && (
                <div className="border-t border-gray-100">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="w-full flex items-center justify-center gap-1 px-4 py-2.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                        {expanded ? (
                            <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                <span>Sembunyikan</span>
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                <span>Lihat Selengkapnya ({insights.length - maxVisible} lagi)</span>
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
