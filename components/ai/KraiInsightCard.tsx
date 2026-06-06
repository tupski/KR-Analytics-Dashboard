'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
    Clock,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { KraiThinkingSteps } from './KraiThinkingSteps';
import type { FilterState } from '@/components/shared/FilterState';
import { generateFollowUpQuestions } from '@/lib/ai/followUpQuestions';
import type { KraiPageContext } from '@/lib/ai/followUpQuestions';
import { normalizeAiText } from '@/lib/ai/normalizeAiText';
import { suggestionToUserPrompt } from '@/lib/ai/suggestionHelper';
import { splitThinkingSteps } from '@/lib/ai/kraiResponseParser';

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
    /** Deprecated — follow-up now renders in-card */
    onFollowUpClick?: (question: string, contextPayload?: Record<string, any>) => void;
}

interface FollowUpAnswer {
    id: string;
    question: string;
    answer: string;
    thinking: string;
    thinkingSteps: string[];
    isStreaming: boolean;
    isTruncated?: boolean;
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

// ─── NDJSON stream reader ───────────────────────────────────────

async function readInsightNDJSON(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    callbacks: {
        onThinking: (delta: string) => void;
        onAnswer: (delta: string) => void;
        onDone: (finishReason: string, isTruncated: boolean) => void;
        onError: (message: string) => void;
    },
): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed);
                switch (event.type) {
                    case 'thinking':
                        callbacks.onThinking(event.delta || '');
                        break;
                    case 'answer':
                        callbacks.onAnswer(event.delta || '');
                        break;
                    case 'done':
                        callbacks.onDone(event.finishReason || 'stop', !!event.isTruncated);
                        break;
                    case 'error':
                        callbacks.onError(event.message || 'Terjadi kesalahan.');
                        break;
                    // usage: silently ignore
                }
            } catch { /* skip */ }
        }
    }
}

// ─── Stream state type ──────────────────────────────────────────

type InsightStreamState = 'idle' | 'streaming' | 'complete' | 'error' | 'timeout'

// ─── Component ───────────────────────────────────────────────────

export default function KraiInsightCard({
    pageContext,
    title,
    subtitle,
    filters,
    dataSummary,
    defaultCollapsed = true,
    badgeLabel = 'KRAI Insight',
    onFollowUpClick: _onFollowUpClick,
}: KraiInsightCardProps) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [followUps, setFollowUps] = useState<string[]>([]);
    const [expandedSugg, setExpandedSugg] = useState<Record<string, boolean>>({});
    const [isSegarkanLoading, setIsSegarkanLoading] = useState(false);
    const [contentExpanded, setContentExpanded] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const streamStateRef = useRef<InsightStreamState>('idle');

    // ── Streaming state for main insight ──
    const [mainThinkingSteps, setMainThinkingSteps] = useState<string[]>([]);
    const [mainStreaming, setMainStreaming] = useState(false);
    const [streamState, setStreamState] = useState<InsightStreamState>('idle');

    // ── In-card follow-up state ──
    const [followUpAnswers, setFollowUpAnswers] = useState<FollowUpAnswer[]>([]);
    const [activeFollowUpIndex, setActiveFollowUpIndex] = useState(0);

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

    /** Clear the answer timeout */
    const clearAnswerTimeout = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const fetchInsight = useCallback(async (forceRefresh = false) => {
        // Check cache (skip when forceRefresh OR regenerate)
        if (!forceRefresh) {
            const cached = getCached(pageContext, dataHash);
            if (cached) {
                const normalized = normalizeAiText(cached);
                setInsight(normalized);
                setCache(pageContext, normalized, dataHash);
                updateFollowUps(normalized);
                setMainThinkingSteps([]);
                setMainStreaming(false);
                setStreamState('complete');
                return;
            }
        }

        // Abort any in-flight request
        if (abortRef.current) {
            abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        setLoading(true);
        setError(null);
        setMainThinkingSteps([]);
        setMainStreaming(true);
        setStreamState('streaming');
        streamStateRef.current = 'streaming';
        if (forceRefresh) setIsSegarkanLoading(true);

        // Start 30-second timeout for answer event
        let gotAnswer = false;
        clearAnswerTimeout();
        timeoutRef.current = setTimeout(() => {
            if (!gotAnswer) {
                streamStateRef.current = 'timeout';
                setStreamState('timeout');
                setError('Waktu tunggu habis. Insight sedang dibuat ulang, coba tunggu sebentar.');
                setMainStreaming(false);
                setLoading(false);
                setIsSegarkanLoading(false);
                if (abortRef.current) {
                    abortRef.current.abort();
                }
            }
        }, 30000);

        try {
            // Use regenerate:true to always bypass server cache
            const res = await fetch('/api/ai/insight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortRef.current.signal,
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
                    regenerate: true, // Always bypass server cache
                    dataSummary,
                    stream: true,
                }),
            });

            if (!res.ok) {
                setStreamState('error');
                setError('Gagal mendapatkan insight');
                setLoading(false);
                setMainStreaming(false);
                setIsSegarkanLoading(false);
                return;
            }

            // Try NDJSON streaming
            const reader = res.body?.getReader();
            if (reader) {
                let accumulatedAnswer = '';
                let accumulatedThinking = '';
                let doneCalled = false;

                await readInsightNDJSON(reader, {
                    onThinking: (delta) => {
                        accumulatedThinking += delta;
                        setMainThinkingSteps(splitThinkingSteps(accumulatedThinking));
                    },
                    onAnswer: (delta) => {
                        gotAnswer = true;
                        clearAnswerTimeout();
                        accumulatedAnswer += delta;
                        setInsight(normalizeAiText(accumulatedAnswer));
                        // If answer is short but thinking is long, keep waiting
                        // (answer may still be streaming — don't mark complete yet)
                    },
                    onDone: (_finishReason, _isTruncated) => {
                        doneCalled = true;
                        gotAnswer = true;
                        clearAnswerTimeout();
                        const final = normalizeAiText(accumulatedAnswer);
                        setInsight(final);
                        setMainStreaming(false);
                        setStreamState('complete');
                        setMainThinkingSteps(splitThinkingSteps(accumulatedThinking));
                        if (final && final.length > 5) {
                            setCache(pageContext, final, dataHash);
                            updateFollowUps(final);
                        }
                        setLoading(false);
                        setIsSegarkanLoading(false);
                    },
                    onError: (message) => {
                        gotAnswer = true;
                        clearAnswerTimeout();
                        setStreamState('error');
                        setError(message);
                        setMainStreaming(false);
                        setLoading(false);
                        setIsSegarkanLoading(false);
                    },
                });

                // If stream ended without done event, handle gracefully
                if (!doneCalled) {
                    gotAnswer = true;
                    clearAnswerTimeout();
                    const final = normalizeAiText(accumulatedAnswer);
                    if (final && final.length > 5) {
                        setInsight(final);
                        setStreamState('complete');
                    } else {
                        setStreamState('error');
                        setError('Insight belum selesai dibuat. Coba segarkan kembali.');
                    }
                    setMainStreaming(false);
                    setLoading(false);
                    setIsSegarkanLoading(false);
                }
                return;
            }

            // Non-streaming fallback
            clearAnswerTimeout();
            const data = await res.json();
            if (data.disabled) {
                setStreamState('error');
                setError('Insight tidak tersedia');
                setLoading(false);
                setMainStreaming(false);
                setIsSegarkanLoading(false);
                return;
            }
            if (data.error && !data.fallback) {
                setStreamState('error');
                setError(data.message || 'Gagal mendapatkan insight');
                setLoading(false);
                setMainStreaming(false);
                setIsSegarkanLoading(false);
                return;
            }
            const raw = data.response?.message || data.response?.text || '';
            const msg = normalizeAiText(raw);
            if (msg && msg.length > 5) {
                setInsight(msg);
                setCache(pageContext, msg, dataHash);
                updateFollowUps(msg);
                setStreamState('complete');
            } else {
                setStreamState('error');
                setError('Insight kosong');
            }
        } catch (err: any) {
            // Ignore abort errors (from timeout or manual cancel)
            if (err.name === 'AbortError') {
                if (streamStateRef.current !== ('timeout' as any)) {
                    setStreamState('error');
                    setError('Permintaan dibatalkan.');
                }
                setLoading(false);
                setMainStreaming(false);
                setIsSegarkanLoading(false);
                return;
            }
            clearAnswerTimeout();
            setStreamState('error');
            setError(err.message || 'Gagal menghubungi server');
        } finally {
            if (!gotAnswer) clearAnswerTimeout();
            setLoading(false);
            setMainStreaming(false);
            setIsSegarkanLoading(false);
        }
    }, [pageContext, buildPrompt, filters, title, dataHash, dataSummary, updateFollowUps, clearAnswerTimeout]);

    // Fetch on mount
    useEffect(() => {
        fetchInsight();
        // Cleanup on unmount
        return () => {
            if (abortRef.current) abortRef.current.abort();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [fetchInsight]);

    /** In-card follow-up: generate answer inside card via streaming */
    const handleFollowUp = useCallback(async (q: string) => {
        const userPrompt = suggestionToUserPrompt(q);
        const followUpId = `fu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        // Create placeholder
        const newFollowUp: FollowUpAnswer = {
            id: followUpId,
            question: q,
            answer: '',
            thinking: '',
            thinkingSteps: [],
            isStreaming: true,
        };
        setFollowUpAnswers(prev => {
            const next = [...prev, newFollowUp];
            setActiveFollowUpIndex(next.length - 1); // point to newest
            return next;
        });

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'user', content: `Berdasarkan insight berikut:\n\n${insight}\n\nJawab pertanyaan ini: ${userPrompt}` },
                    ],
                    config: { provider: 'auto', model: 'auto' },
                    stream: true,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                setFollowUpAnswers(prev => prev.map(fa =>
                    fa.id === followUpId
                        ? { ...fa, answer: `⚠️ Gagal: ${errData.error || `HTTP ${res.status}`}`, isStreaming: false }
                        : fa,
                ));
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) {
                // Non-streaming fallback
                const data = await res.json();
                const answer = normalizeAiText(data.message || 'Tidak ada jawaban.');
                setFollowUpAnswers(prev => prev.map(fa =>
                    fa.id === followUpId
                        ? { ...fa, answer, isStreaming: false }
                        : fa,
                ));
                return;
            }

            let accumulatedAnswer = '';
            let accumulatedThinking = '';

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const event = JSON.parse(trimmed);
                        switch (event.type) {
                            case 'thinking':
                                accumulatedThinking += event.delta || '';
                                setFollowUpAnswers(prev => prev.map(fa =>
                                    fa.id === followUpId
                                        ? { ...fa, thinking: accumulatedThinking, thinkingSteps: splitThinkingSteps(accumulatedThinking) }
                                        : fa,
                                ));
                                break;
                            case 'answer':
                                accumulatedAnswer += event.delta || '';
                                setFollowUpAnswers(prev => prev.map(fa =>
                                    fa.id === followUpId
                                        ? { ...fa, answer: accumulatedAnswer }
                                        : fa,
                                ));
                                break;
                            case 'done':
                                setFollowUpAnswers(prev => prev.map(fa =>
                                    fa.id === followUpId
                                        ? {
                                            ...fa,
                                            answer: normalizeAiText(accumulatedAnswer || 'Insight sedang dibuat...'),
                                            thinking: accumulatedThinking,
                                            thinkingSteps: splitThinkingSteps(accumulatedThinking),
                                            isStreaming: false,
                                            isTruncated: !!event.isTruncated,
                                        }
                                        : fa,
                                ));
                                break;
                            case 'error':
                                setFollowUpAnswers(prev => prev.map(fa =>
                                    fa.id === followUpId
                                        ? { ...fa, answer: `⚠️ ${event.message || 'Terjadi kesalahan.'}`, isStreaming: false }
                                        : fa,
                                ));
                                break;
                        }
                    } catch { /* skip */ }
                }
            }
        } catch (err: any) {
            setFollowUpAnswers(prev => prev.map(fa =>
                fa.id === followUpId
                    ? { ...fa, answer: `⚠️ ${err.message || 'Gagal'}`, isStreaming: false }
                    : fa,
            ));
        }
    }, [insight]);

    const activeFollowUp = followUpAnswers[activeFollowUpIndex];

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
                    {loading && !insight && (
                        <div className="flex items-center gap-2 text-sm text-blue-600 py-3">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span>Menganalisis data...</span>
                        </div>
                    )}

                    {/* Error / Timeout */}
                    {error && !loading && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-2">
                            {streamState === 'timeout' ? (
                                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            )}
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

                    {/* Streaming thinking steps for main insight */}
                    {mainStreaming && mainThinkingSteps.length > 0 && (
                        <div className="mb-2">
                            <KraiThinkingSteps
                                steps={mainThinkingSteps}
                                isStreaming={true}
                            />
                        </div>
                    )}

                    {/* Insight content */}
                    {(insight || mainStreaming) && !error && (
                        <>
                            <div className={`relative ${!contentExpanded ? 'max-h-[260px] overflow-hidden' : ''}`}>
                                <MarkdownRenderer content={insight || ''} className="text-sm text-gray-800 leading-relaxed" />
                                {!contentExpanded && insight && insight.length > 400 && (
                                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                                )}
                            </div>
                            {insight && insight.length > 400 && (
                                <button
                                    onClick={() => setContentExpanded(!contentExpanded)}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
                                >
                                    {contentExpanded ? 'Ringkas' : 'Lihat selengkapnya'}
                                </button>
                            )}

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

                            {/* Follow-up questions — generate IN-CARD, NOT dispatch */}
                            {!mainStreaming && followUps.length > 0 && (
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

                            {/* ── In-card follow-up answers ── */}
                            {followUpAnswers.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-blue-100">
                                    {/* Navigation */}
                                    {followUpAnswers.length > 1 && (
                                        <div className="flex items-center gap-2 mb-2">
                                            <button
                                                onClick={() => setActiveFollowUpIndex(Math.max(0, activeFollowUpIndex - 1))}
                                                disabled={activeFollowUpIndex === 0}
                                                className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-30"
                                            >
                                                ← Prev
                                            </button>
                                            <span className="text-xs text-gray-400">
                                                {activeFollowUpIndex + 1} / {followUpAnswers.length}
                                            </span>
                                            <button
                                                onClick={() => setActiveFollowUpIndex(Math.min(followUpAnswers.length - 1, activeFollowUpIndex + 1))}
                                                disabled={activeFollowUpIndex === followUpAnswers.length - 1}
                                                className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-30"
                                            >
                                                Next →
                                            </button>
                                        </div>
                                    )}

                                    {activeFollowUp && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-medium text-blue-700 bg-blue-100 px-3 py-1.5 rounded-lg">
                                                {activeFollowUp.question}
                                            </div>

                                            {/* Thinking steps */}
                                            {activeFollowUp.thinkingSteps.length > 0 && (
                                                <KraiThinkingSteps
                                                    steps={activeFollowUp.thinkingSteps}
                                                    isStreaming={activeFollowUp.isStreaming}
                                                    isComplete={!activeFollowUp.isStreaming}
                                                />
                                            )}

                                            {/* Answer */}
                                            {activeFollowUp.answer && (
                                                <div className="bg-white border border-blue-100 rounded-lg p-3">
                                                    <MarkdownRenderer content={activeFollowUp.answer} className="text-sm" />
                                                </div>
                                            )}

                                            {/* Loading */}
                                            {activeFollowUp.isStreaming && !activeFollowUp.answer && (
                                                <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                                                    <div className="flex gap-1">
                                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </div>
                                                    <span>Menjawab...</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
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
