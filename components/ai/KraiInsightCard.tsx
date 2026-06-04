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
import { generateFollowUpQuestions } from '@/lib/ai/followUpQuestions';
import type { KraiPageContext } from '@/lib/ai/followUpQuestions';
import { normalizeAiText } from '@/lib/ai/normalizeAiText';
import { suggestionToUserPrompt } from '@/lib/ai/suggestionHelper';

// ─── Types ───────────────────────────────────────────────────────

export type { KraiPageContext };

export interface KraiInsightCardProps {
    pageContext: KraiPageContext;
    title: string;
    subtitle?: string;
    filters?: FilterState;
    /** Structured page data for contextual AI insights */
    dataSummary?: Record<string, any>;
    defaultCollapsed?: boolean;
    badgeLabel?: string;
    /** Called when user clicks follow-up — sends question + context to KRAI chat */
    onFollowUpClick?: (question: string, contextPayload?: Record<string, any>) => void;
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
    const [expandedSugg, setExpandedSugg] = useState<Record<string, boolean>>({});
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

    /** Generate follow-up questions from shared rule-based lib */
    const updateFollowUps = useCallback((insightText: string) => {
        const qs = generateFollowUpQuestions({
            pageContext,
            insightText,
            hasComparison: filters?.comparisonMode != null && filters.comparisonMode !== 'none',
            hasActiveFilters: !!filters?.rangePreset || !!filters?.startDate,
        });
        setFollowUps(qs);
    }, [pageContext, filters]);

    const fetchInsight = useCallback(async (forceRefresh = false) => {
        // Check cache (skip when forceRefresh)
        if (!forceRefresh) {
            const cached = getCached(pageContext, dataHash);
            if (cached) {
                // Normalize cache on read — handles old raw JSON cached entries
                const normalized = normalizeAiText(cached);
                setInsight(normalized);
                // Overwrite cache with normalized version
                setCache(pageContext, normalized, dataHash);
                updateFollowUps(normalized);
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

            // Extract message from response — normalize to strip any JSON wrapping
            const raw = data.response?.message || data.response?.text || '';
            const msg = normalizeAiText(raw);
            if (msg && msg.length > 5) {
                setInsight(msg);
                // Only cache normalized text — never raw JSON
                setCache(pageContext, msg, dataHash);
                updateFollowUps(msg);
            } else {
                setError('Insight kosong');
            }
        } catch (err: any) {
            setError(err.message || 'Gagal menghubungi server');
        } finally {
            setLoading(false);
            setIsSegarkanLoading(false);
        }
    }, [pageContext, buildPrompt, filters, title, dataHash, dataSummary, updateFollowUps]);

    // Fetch on mount
    useEffect(() => {
        fetchInsight();
    }, [fetchInsight]);

    /** Send follow-up question to KRAI chat with context payload — uses transformed user prompt */
    const handleFollowUp = (q: string) => {
        const userPrompt = suggestionToUserPrompt(q);
        if (onFollowUpClick) {
            onFollowUpClick(userPrompt, {
                pageContext,
                insightText: insight || '',
                rangePreset: filters?.rangePreset,
                startDate: filters?.startDate,
                endDate: filters?.endDate,
                comparisonMode: filters?.comparisonMode,
                comparisonStartDate: filters?.comparisonStartDate,
                comparisonEndDate: filters?.comparisonEndDate,
                reportPeriodMode: filters?.reportPeriodMode,
                dataSummary,
            });
        } else {
            // Fallback: dispatch event for chat components
            window.dispatchEvent(new CustomEvent('ai-chat-prompt-send', { detail: userPrompt }));
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

                    {/* Insight content */}
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

                            {/* Follow-up questions — send to KRAI chat */}
                            {followUps.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-blue-100">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Lightbulb className="w-3 h-3 text-blue-500" />
                                        <span className="text-xs text-blue-600 font-medium">Tanyakan ke KRAI</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                                        {followUps.slice(0, 3).map((q) => {
                                            const suggKey = q.slice(0, 20);
                                            const isExpanded = !!expandedSugg[suggKey];
                                            const isLong = q.length > 80;
                                            return (
                                                <div
                                                    key={suggKey}
                                                    className="text-xs bg-white border border-blue-200 rounded-xl text-blue-700 flex items-start gap-1.5 sm:max-w-xs"
                                                >
                                                    {/* Chevron — toggle expand */}
                                                    {isLong && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedSugg(prev => ({ ...prev, [suggKey]: !prev[suggKey] }));
                                                            }}
                                                            className="flex-shrink-0 mt-1 ml-2 cursor-pointer hover:bg-blue-100 rounded p-0.5 transition-colors"
                                                            aria-label={isExpanded ? 'Ciutkan' : 'Perluas'}
                                                        >
                                                            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                                        </button>
                                                    )}
                                                    {!isLong && (
                                                        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-1 ml-2 text-blue-400" />
                                                    )}
                                                    {/* Suggestion body — click sends user intent */}
                                                    <button
                                                        onClick={() => handleFollowUp(q)}
                                                        className="flex-1 py-2 pr-3 text-left cursor-pointer min-w-0"
                                                        title={q}
                                                    >
                                                        <span className={isExpanded ? '' : 'line-clamp-2'}>{q}</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
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
