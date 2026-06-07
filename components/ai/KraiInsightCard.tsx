'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// ─── Batch streaming constants (prevents DOM freeze from per-token re-renders) ─
const INSIGHT_WORD_BATCH_SIZE = 10;
const INSIGHT_FLUSH_INTERVAL_MS = 150;
const THINKING_STEP_FLUSH_INTERVAL_MS = 300;

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

    // ── Batch streaming refs (prevents per-token DOM re-renders) ──
    const streamBufferRef = useRef('');
    const flushTimerRef = useRef<number | null>(null);
    const lastFlushRef = useRef(0);
    // ── Thinking step throttle ──
    const thinkingBufferRef = useRef('');
    const thinkingTimerRef = useRef<number | null>(null);
    const lastThinkingFlushRef = useRef(0);
    // ── Active request tracking to prevent duplicate generation ──
    const activeRequestRef = useRef(false);
    // ── Cached insight guard: avoid auto-regenerate if already cached ──
    const hasCachedInsightRef = useRef(false);

    // ── Streaming state for main insight ──
    const [mainThinkingSteps, setMainThinkingSteps] = useState<string[]>([]);
    const [mainStreaming, setMainStreaming] = useState(false);
    const [streamState, setStreamState] = useState<InsightStreamState>('idle');

    // ── In-card follow-up state ──
    const [followUpAnswers, setFollowUpAnswers] = useState<FollowUpAnswer[]>([]);
    const [activeFollowUpIndex, setActiveFollowUpIndex] = useState(0);

    // ── Stable memoized derivations to prevent effect re-triggers ──
    const dataHash = useMemo(() => hashData(dataSummary), [dataSummary]);
    const stableFiltersKey = useMemo(() => {
        if (!filters) return '';
        const { comparisonMode, rangePreset, startDate, endDate, comparisonStartDate, comparisonEndDate, reportPeriodMode } = filters;
        return `${rangePreset || ''}|${startDate || ''}|${endDate || ''}|${comparisonMode || ''}|${comparisonStartDate || ''}|${comparisonEndDate || ''}|${reportPeriodMode || ''}`;
    }, [filters]);

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

    // ── Flush helpers: batch insight text to prevent per-token re-renders ──
    const countWords = useCallback((text: string) => text.trim().split(/\s+/).filter(Boolean).length, []);

    const flushInsightBuffer = useCallback((force = false) => {
        const now = Date.now();
        const buffered = streamBufferRef.current;
        if (!buffered) return;
        const enoughWords = countWords(buffered) >= INSIGHT_WORD_BATCH_SIZE;
        const enoughTime = now - lastFlushRef.current >= INSIGHT_FLUSH_INTERVAL_MS;
        if (!force && !enoughWords && !enoughTime) return;
        streamBufferRef.current = '';
        lastFlushRef.current = now;
        setInsight(prev => {
            const current = prev ?? '';
            return normalizeAiText(current + buffered);
        });
    }, [countWords]);

    const flushThinkingBuffer = useCallback((accumulated: string) => {
        const now = Date.now();
        const enoughTime = now - lastThinkingFlushRef.current >= THINKING_STEP_FLUSH_INTERVAL_MS;
        if (!enoughTime && thinkingBufferRef.current.length > 0) return;
        thinkingBufferRef.current = '';
        lastThinkingFlushRef.current = now;
        setMainThinkingSteps(splitThinkingSteps(accumulated));
    }, []);

    const fetchInsight = useCallback(async (forceRefresh = false) => {
        console.debug('[KRAI Insight Generate Trigger]', {
            pageContext,
            forceRefresh,
            dataHash,
            reason: forceRefresh ? 'manual refresh' : 'initial fetch',
        });

        // ── Guard: prevent concurrent requests ──
        if (activeRequestRef.current) {
            console.debug('[KRAI Insight] Skipped — request already in flight');
            return;
        }

        // Check cache (skip when forceRefresh)
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
                hasCachedInsightRef.current = true;
                return;
            }
        }

        // Abort any in-flight request
        if (abortRef.current) {
            abortRef.current.abort();
        }
        abortRef.current = new AbortController();
        activeRequestRef.current = true;

        // Reset batch buffers
        streamBufferRef.current = '';
        thinkingBufferRef.current = '';
        lastFlushRef.current = 0;
        lastThinkingFlushRef.current = 0;
        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
        if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }

        setLoading(true);
        setError(null);
        setInsight(null); // Clear stale insight during streaming
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
                setError('KRAI butuh waktu lebih lama dari biasanya. Coba regenerate jawaban ini.');
                console.debug('[KRAI Timeout]', {
                    pageContext,
                    dataHash,
                    timeoutMs: 30000,
                    hasDataSummary: !!dataSummary,
                });
                flushInsightBuffer(true);
                setMainStreaming(false);
                setLoading(false);
                setIsSegarkanLoading(false);
                activeRequestRef.current = false;
                if (abortRef.current) {
                    abortRef.current.abort();
                }
            }
        }, 30000);

        try {
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
                    regenerate: true,
                    dataSummary,
                    stream: true,
                }),
            });

            if (!res.ok) {
                setStreamState('error');
                setError('KRAI mengalami kendala. Coba segarkan kembali.');
                setLoading(false);
                setMainStreaming(false);
                setIsSegarkanLoading(false);
                activeRequestRef.current = false;
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
                        thinkingBufferRef.current += delta;
                        // Throttle thinking step updates — only flush periodically
                        flushThinkingBuffer(accumulatedThinking);
                        // Also schedule a delayed flush if no more thinking events come
                        if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
                        thinkingTimerRef.current = window.setTimeout(() => {
                            thinkingTimerRef.current = null;
                            thinkingBufferRef.current = '';
                            setMainThinkingSteps(splitThinkingSteps(accumulatedThinking));
                        }, THINKING_STEP_FLUSH_INTERVAL_MS);
                    },
                    onAnswer: (delta) => {
                        gotAnswer = true;
                        clearAnswerTimeout();
                        accumulatedAnswer += delta;
                        // ── Batch stream buffer: don't render per-token ──
                        streamBufferRef.current += delta;
                        if (!flushTimerRef.current) {
                            flushTimerRef.current = window.setTimeout(() => {
                                flushTimerRef.current = null;
                                flushInsightBuffer(true);
                            }, INSIGHT_FLUSH_INTERVAL_MS);
                        }
                        flushInsightBuffer(false);
                    },
                    onDone: (_finishReason, _isTruncated) => {
                        doneCalled = true;
                        gotAnswer = true;
                        clearAnswerTimeout();
                        flushInsightBuffer(true); // Force flush remaining
                        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
                        if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
                        // Build final from accumulated to ensure completeness
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
                        activeRequestRef.current = false;
                    },
                    onError: (message) => {
                        gotAnswer = true;
                        clearAnswerTimeout();
                        flushInsightBuffer(true);
                        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
                        if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
                        console.debug('[KRAI Insight] Stream error', {
                            pageContext,
                            error: message,
                        });
                        setStreamState('error');
                        setError(message || 'KRAI mengalami kendala. Coba segarkan kembali.');
                        setMainStreaming(false);
                        setLoading(false);
                        setIsSegarkanLoading(false);
                        activeRequestRef.current = false;
                    },
                });

                // If stream ended without done event, handle gracefully
                if (!doneCalled) {
                    gotAnswer = true;
                    clearAnswerTimeout();
                    flushInsightBuffer(true);
                    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
                    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
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
                    activeRequestRef.current = false;
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
                activeRequestRef.current = false;
                return;
            }
            if (data.error && !data.fallback) {
                setStreamState('error');
                setError(data.message || 'KRAI mengalami kendala. Coba segarkan kembali.');
                setLoading(false);
                setMainStreaming(false);
                setIsSegarkanLoading(false);
                activeRequestRef.current = false;
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
                setError('Insight belum selesai dibuat. Coba segarkan kembali.');
            }
            activeRequestRef.current = false;
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
                activeRequestRef.current = false;
                return;
            }
            clearAnswerTimeout();
            setStreamState('error');
            setError(err.message || 'KRAI mengalami kendala. Coba segarkan kembali.');
            activeRequestRef.current = false;
        } finally {
            if (!gotAnswer) clearAnswerTimeout();
            setLoading(false);
            setMainStreaming(false);
            setIsSegarkanLoading(false);
            activeRequestRef.current = false;
        }
    }, [pageContext, buildPrompt, filters, title, dataHash, dataSummary, updateFollowUps, clearAnswerTimeout, flushInsightBuffer, flushThinkingBuffer]);

    // ── Fetch on mount with lazy generation (T9: kill switch) ──
    useEffect(() => {
        // If already has cached insight for same period, don't auto-generate
        if (hasCachedInsightRef.current) {
            return;
        }
        // Check session cache first
        const cached = getCached(pageContext, dataHash);
        if (cached) {
            const normalized = normalizeAiText(cached);
            setInsight(normalized);
            setMainThinkingSteps([]);
            setMainStreaming(false);
            setStreamState('complete');
            hasCachedInsightRef.current = true;
            updateFollowUps(normalized);
            return;
        }
        // Lazy generation: defer to when browser is idle
        const timer = window.setTimeout(() => {
            fetchInsight();
        }, 400);
        // Cleanup on unmount
        return () => {
            clearTimeout(timer);
            if (abortRef.current) abortRef.current.abort();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
            if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
            activeRequestRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageContext, dataHash]);

    /** In-card follow-up: generate answer inside card via streaming */
    const handleFollowUp = useCallback(async (q: string) => {
        // ── Guard: don't trigger if insight not ready ──
        if (!insight || insight.trim().length === 0) {
            console.debug('[KRAI FollowUp] Blocked — insight not ready', {
                pageContext,
                hasInsight: !!insight,
                insightLength: insight?.length || 0,
            });
            return;
        }

        const userPrompt = suggestionToUserPrompt(q);
        const followUpId = `fu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        console.debug('[KRAI FollowUp] Starting', {
            followUpId,
            question: q.slice(0, 100),
            pageContext,
            insightLength: insight.length,
        });

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
                        {
                            role: 'user',
                            content: `Konteks halaman: ${pageContext}\n\nBerdasarkan insight berikut:\n\n${insight?.slice(0, 3000) || ''}\n\nJawab pertanyaan lanjutan ini: ${userPrompt}`,
                        },
                    ],
                    config: { provider: 'auto', model: 'auto' },
                    stream: true,
                    // ── Enhanced context payload ──────────────────────────
                    pageContext,
                    currentInsightText: insight?.slice(0, 3000) || '',
                    dataSummary: dataSummary || undefined,
                    filters: filters ? {
                        startDate: filters.startDate,
                        endDate: filters.endDate,
                        comparisonStartDate: filters.comparisonStartDate,
                        comparisonEndDate: filters.comparisonEndDate,
                        reportPeriodMode: filters.reportPeriodMode,
                    } : undefined,
                    allowedTools: [
                        'get_dashboard_kpi_panel',
                        'get_marketing_panel',
                        'get_operations_panel',
                        'get_financial_panel',
                        'compare_periods',
                        'search_transactions',
                        'search_expenses',
                        'get_live_checkins',
                        'get_guest_stay_history',
                        'get_unpaid_bills_detail',
                    ],
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.debug('[KRAI FollowUp] API error', {
                    followUpId,
                    status: res.status,
                    error: errData.error || '(none)',
                });
                setFollowUpAnswers(prev => prev.map(fa =>
                    fa.id === followUpId
                        ? { ...fa, answer: `KRAI gagal menjawab pertanyaan lanjutan. Coba ulangi beberapa saat lagi.`, isStreaming: false }
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
                                {
                                    const finalAnswer = accumulatedAnswer.trim()
                                        ? normalizeAiText(accumulatedAnswer)
                                        : 'KRAI gagal menjawab pertanyaan lanjutan. Coba ulangi beberapa saat lagi.';
                                    setFollowUpAnswers(prev => prev.map(fa =>
                                        fa.id === followUpId
                                            ? {
                                                ...fa,
                                                answer: finalAnswer,
                                                thinking: accumulatedThinking,
                                                thinkingSteps: splitThinkingSteps(accumulatedThinking),
                                                isStreaming: false,
                                                isTruncated: !!event.isTruncated,
                                            }
                                            : fa,
                                    ));
                                }
                                break;
                            case 'error':
                                console.debug('[KRAI FollowUp] Stream error', {
                                    followUpId,
                                    error: event.message || '(no message)',
                                });
                                setFollowUpAnswers(prev => prev.map(fa =>
                                    fa.id === followUpId
                                        ? { ...fa, answer: `KRAI gagal menjawab pertanyaan lanjutan. Coba ulangi beberapa saat lagi.`, isStreaming: false }
                                        : fa,
                                ));
                                break;
                        }
                    } catch { /* skip */ }
                }
            }
        } catch (err: any) {
            console.debug('[KRAI FollowUp] Exception', {
                followUpId,
                error: err.message || 'Unknown',
            });
            setFollowUpAnswers(prev => prev.map(fa =>
                fa.id === followUpId
                    ? { ...fa, answer: `KRAI gagal menjawab pertanyaan lanjutan. Coba ulangi beberapa saat lagi.`, isStreaming: false }
                    : fa,
            ));
        }
    }, [insight, pageContext, dataSummary, filters]);

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
                                {mainStreaming ? (
                                    /* T8: Lightweight rendering during streaming — plain text, no Markdown parse */
                                    <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                                        {insight || ''}
                                    </div>
                                ) : (
                                    <MarkdownRenderer content={insight || ''} className="text-sm text-gray-800 leading-relaxed" />
                                )}
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
                            {!mainStreaming && followUps.length > 0 && insight && insight.trim().length > 0 && (
                                <div className="mt-3 pt-3 border-t border-blue-100">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Lightbulb className="w-3 h-3 text-blue-500" />
                                        <span className="text-xs text-blue-600 font-medium">Tanyakan ke KRAI</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                                        {followUps.slice(0, 3).map((q) => {
                                            const isTimeoutOrError = streamState === 'timeout' || streamState === 'error';
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
                                                        disabled={insight ? insight.trim().length === 0 : true}
                                                        className="flex-1 py-2 pr-3 text-left cursor-pointer min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={insight && insight.trim().length === 0
                                                            ? 'Tunggu insight selesai dulu.'
                                                            : isTimeoutOrError
                                                                ? 'Insight belum tersedia. Klik regenerate dulu.'
                                                                : q
                                                        }
                                                    >
                                                        <span className={isExpanded ? '' : 'line-clamp-2'}>
                                                            {isTimeoutOrError ? 'Regenerate insight' : q}
                                                        </span>
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
