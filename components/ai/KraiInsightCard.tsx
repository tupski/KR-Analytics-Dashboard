'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    RefreshCw,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Lightbulb,
    ChevronRight,
    Zap,
    AlertCircle,
    Bot,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import type { FilterState } from '@/components/shared/FilterState';

// ─── Types ───────────────────────────────────────────────────────

export type KraiPageContext = 'dashboard' | 'booking' | 'unit' | 'customer' | 'laporan';

export interface KraiInsightCardProps {
    pageContext: KraiPageContext;
    title: string;
    subtitle?: string;
    filters?: FilterState;
    /** Structured page data for contextual AI insights */
    dataSummary?: Record<string, any>;
    defaultCollapsed?: boolean;
    badgeLabel?: string;
    onFollowUpClick?: (question: string) => void;
}

// ─── Follow-up question templates per page context ───────────────

const FOLLOW_UP_TEMPLATES: Record<KraiPageContext, string[]> = {
    dashboard: [
        'Apa yang perlu diperhatikan hari ini?',
        'Rekomendasi untuk meningkatkan pendapatan?',
    ],
    booking: [
        'Channel mana yang paling efektif?',
        'Booking minggu ini vs minggu lalu?',
    ],
    unit: [
        'Unit mana yang perlu perhatian?',
        'Okupansi per lokasi?',
    ],
    customer: [
        'Pola booking pelanggan?',
        'Pelanggan yang sering booking?',
    ],
    laporan: [
        'Kategori pengeluaran terbesar?',
        'Bandingkan dengan periode lalu?',
    ],
};

/**
 * Generate contextual follow-up questions based on page context and insight content.
 * Returns static templates when called outside component (pure helper).
 */
export function generateFollowUpQuestions(
    pageContext: KraiPageContext,
    insightContent?: string,
): string[] {
    // If insight content contains certain keywords, return more specific questions
    if (insightContent) {
        const lower = insightContent.toLowerCase();

        if (lower.includes('pendapatan') && lower.includes('turun')) {
            return [
                'Kenapa pendapatan turun?',
                'Lokasi mana yang paling mempengaruhi?',
                'Rekomendasi menaikkan pendapatan?',
            ];
        }
        if (lower.includes('okupansi') && (lower.includes('rendah') || lower.includes('turun'))) {
            return [
                'Unit mana yang kosong?',
                'Penyebab okupansi rendah?',
                'Bandingkan dengan lokasi lain',
            ];
        }
        if (lower.includes('pengeluaran') || lower.includes('expense') || lower.includes('biaya')) {
            if (lower.includes('naik') || lower.includes('besar')) {
                return [
                    'Kategori pengeluaran paling naik?',
                    'Apakah normal untuk periode ini?',
                    'Bandingkan dengan bulan lalu',
                ];
            }
        }
        if (lower.includes('booking') && lower.includes('turun')) {
            return [
                'Channel mana yang turun?',
                'Lokasi dengan booking turun?',
                'Rekomendasi meningkatkan booking?',
            ];
        }
        if (lower.includes('channel') || lower.includes('marketing')) {
            return [
                'Channel mana paling efektif?',
                'ROI per channel marketing?',
            ];
        }
    }

    // Fallback to page-specific defaults
    return FOLLOW_UP_TEMPLATES[pageContext] ?? FOLLOW_UP_TEMPLATES.dashboard;
}

// ─── Cache helpers ───────────────────────────────────────────────

const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCacheKey(pageContext: string, dataHash?: string): string {
    return `kr-insight-${pageContext}${dataHash ? '-' + dataHash : ''}`;
}

function getCached(pageContext: string, dataHash?: string): string | null {
    try {
        const raw = sessionStorage.getItem(getCacheKey(pageContext, dataHash));
        if (raw) {
            const { text, timestamp } = JSON.parse(raw);
            if (Date.now() - timestamp < CLIENT_CACHE_TTL) return text;
        }
    } catch { }
    return null;
}

function setCache(pageContext: string, text: string, dataHash?: string) {
    try {
        sessionStorage.setItem(
            getCacheKey(pageContext, dataHash),
            JSON.stringify({ text, timestamp: Date.now() }),
        );
    } catch { }
}

// ─── Simple data hash for cache invalidation ────────────────────

function hashData(data?: Record<string, any>): string {
    if (!data) return '';
    try {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    } catch {
        return '';
    }
}

// ─── Component ───────────────────────────────────────────────────

export default function KraiInsightCard({
    pageContext,
    title,
    subtitle,
    filters,
    dataSummary,
    defaultCollapsed = true,
    badgeLabel = 'KRAI Insight',
    onFollowUpClick,
}: KraiInsightCardProps) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [followUps, setFollowUps] = useState<string[]>([]);
    const [isSegarkanLoading, setIsSegarkanLoading] = useState(false);

    const dataHash = hashData(dataSummary);

    // Build prompt from page context + optional data summary
    const buildPrompt = useCallback((): string => {
        const parts: string[] = [];

        switch (pageContext) {
            case 'dashboard':
                parts.push('Berikan ringkasan performa bisnis hari ini.');
                break;
            case 'booking':
                parts.push('Analisis data booking dan pola pemesanan.');
                break;
            case 'unit':
                parts.push('Analisis performa unit dan okupansi.');
                break;
            case 'customer':
                parts.push('Analisis data pelanggan dan pola booking.');
                break;
            case 'laporan':
                parts.push('Analisis laporan keuangan dan pengeluaran.');
                break;
        }

        parts.push('Beri 1 rekomendasi actionable. Bahasa Indonesia.');
        return parts.join(' ');
    }, [pageContext]);

    const fetchInsight = useCallback(async (forceRefresh = false) => {
        // Check cache (skip when forceRefresh)
        if (!forceRefresh) {
            const cached = getCached(pageContext, dataHash);
            if (cached) {
                setInsight(cached);
                setFollowUps(generateFollowUpQuestions(pageContext, cached));
                return;
            }
        }

        setLoading(true);
        setError(null);
        if (forceRefresh) setIsSegarkanLoading(true);

        try {
            const res = await fetch('/api/ai/insight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page: pageContext,
                    prompt: buildPrompt(),
                    rangePreset: filters?.rangePreset,
                    startDate: filters?.startDate,
                    endDate: filters?.endDate,
                    comparisonMode: filters?.comparisonMode,
                    comparisonStartDate: filters?.comparisonStartDate,
                    comparisonEndDate: filters?.comparisonEndDate,
                    reportPeriodMode: filters?.reportPeriodMode,
                    title,
                    forceRefresh,
                    dataSummary,
                }),
            });

            if (!res.ok) {
                setError('Gagal mendapatkan insight');
                setLoading(false);
                setIsSegarkanLoading(false);
                return;
            }

            const data = await res.json();

            if (data.disabled) {
                setError('Insight tidak tersedia');
                setLoading(false);
                setIsSegarkanLoading(false);
                return;
            }

            if (data.error && !data.fallback) {
                setError(data.message || 'Gagal mendapatkan insight');
                setLoading(false);
                setIsSegarkanLoading(false);
                return;
            }

            // Extract message from response — supports both new (message) and old (text) formats
            const msg = data.response?.message || data.response?.text || '';
            if (msg && msg.length > 5) {
                setInsight(msg);
                setCache(pageContext, msg, dataHash);
                setFollowUps(generateFollowUpQuestions(pageContext, msg));
            } else {
                setError('Insight kosong');
            }
        } catch (err: any) {
            setError(err.message || 'Gagal menghubungi server');
        } finally {
            setLoading(false);
            setIsSegarkanLoading(false);
        }
    }, [pageContext, buildPrompt, filters, title, dataSummary, dataHash]);

    // Fetch on mount
    useEffect(() => {
        fetchInsight();
    }, [fetchInsight]);

    const handleFollowUp = (q: string) => {
        if (onFollowUpClick) {
            onFollowUpClick(q);
        }
    };

    const handleRefresh = (e: React.MouseEvent) => {
        e.stopPropagation();
        fetchInsight(true);
    };

    return (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
            {/* ── Header / Badge ── */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-blue-50/50 transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Bot className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                        <Sparkles className="w-3 h-3" />
                        {badgeLabel}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{title}</h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {/* Refresh button — always visible when expanded */}
                    {!collapsed && (
                        <button
                            onClick={handleRefresh}
                            disabled={loading}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                            title="Segarkan insight"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSegarkanLoading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                    {collapsed ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                    )}
                </div>
            </button>

            {/* ── Expanded Content ── */}
            {!collapsed && (
                <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                    {subtitle && (
                        <p className="text-xs text-gray-500 mb-2">{subtitle}</p>
                    )}

                    {/* Loading */}
                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600 py-3">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span>Menganalisis data...</span>
                        </div>
                    )}

                    {/* Error */}
                    {error && !loading && (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <p className="text-xs text-amber-700">{error}</p>
                                <button
                                    onClick={handleRefresh}
                                    className="ml-auto shrink-0 text-xs font-medium text-amber-700 underline whitespace-nowrap"
                                >
                                    Coba lagi
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Insight content — rendered as Markdown for natural language text */}
                    {insight && !loading && (
                        <>
                            <MarkdownRenderer content={insight} className="text-sm text-gray-800 leading-relaxed" />

                            {/* Segarkan button at bottom */}
                            <div className="mt-3 flex justify-end">
                                <button
                                    onClick={handleRefresh}
                                    disabled={loading}
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3 h-3 ${isSegarkanLoading ? 'animate-spin' : ''}`} />
                                    Segarkan
                                </button>
                            </div>

                            {/* Follow-up questions */}
                            {followUps.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-blue-100">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Lightbulb className="w-3 h-3 text-blue-500" />
                                        <span className="text-xs text-blue-600 font-medium">Pertanyaan lanjutan:</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                                        {followUps.slice(0, 3).map((q) => (
                                            <button
                                                key={q}
                                                onClick={() => handleFollowUp(q)}
                                                className="text-xs px-3 py-2 bg-white border border-blue-200 rounded-xl text-blue-700 hover:bg-blue-100 transition-colors text-left flex items-start gap-1.5 sm:max-w-xs"
                                            >
                                                <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                <span className="line-clamp-2">{q}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Disabled state: no insight, no error, no loading */}
                    {!insight && !error && !loading && (
                        <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                            <Zap className="w-4 h-4 text-gray-400" />
                            <span>Insight tidak tersedia untuk periode ini.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
