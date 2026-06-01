'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Lightbulb, GitCompareArrows, ChevronRight, Zap, AlertCircle } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

interface AIInsightCardProps {
    prompt: string;
    title?: string;
    className?: string;
    alternativeQuestions?: string[];
    /** Page identifier for cache scoping (e.g. 'dashboard', 'booking') */
    page?: string;
    /** Optional range/date info forwarded to the API */
    rangePreset?: string;
    startDate?: string;
    endDate?: string;
    comparisonMode?: string;
    comparisonStartDate?: string;
    comparisonEndDate?: string;
    reportPeriodMode?: string;
}

const CACHE_PREFIX = 'kr-ai-insight-client-';
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 min client-side fallback

export default function AIInsightCard({
    prompt,
    title = 'KR-AI Insight',
    className = '',
    alternativeQuestions,
    page = 'default',
    rangePreset,
    startDate,
    endDate,
    comparisonMode,
    comparisonStartDate,
    comparisonEndDate,
    reportPeriodMode,
}: AIInsightCardProps) {
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
    const [insightMode, setInsightMode] = useState<string>('ai-with-fallback');
    const [expanded, setExpanded] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState(prompt);
    const [compareMode, setCompareMode] = useState(false);
    const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);

    const defaultAlternatives = alternativeQuestions || [
        'Apa yang perlu diperhatikan hari ini?',
        'Berikan rekomendasi untuk meningkatkan pendapatan.',
        'Performa minggu ini vs minggu lalu.',
    ];

    // Client-side cache helpers (secondary cache — primary is server-side)
    const getClientCacheKey = (p: string, cmp: boolean) =>
        CACHE_PREFIX + btoa(encodeURIComponent(page + '|' + p + (cmp ? '|cmp' : ''))).slice(0, 32);

    const getClientCached = useCallback((p: string, cmp: boolean): string | null => {
        try {
            const raw = sessionStorage.getItem(getClientCacheKey(p, cmp));
            if (raw) {
                const { text, timestamp } = JSON.parse(raw);
                if (Date.now() - timestamp < CLIENT_CACHE_TTL) return text;
            }
        } catch { }
        return null;
    }, [page]);

    const setClientCache = useCallback((p: string, cmp: boolean, text: string) => {
        try {
            sessionStorage.setItem(
                getClientCacheKey(p, cmp),
                JSON.stringify({ text, timestamp: Date.now() }),
            );
        } catch { }
    }, [page]);

    // Load AI Insight settings on mount
    useEffect(() => {
        async function loadSettings() {
            try {
                const res = await fetch('/api/app-settings');
                if (res.ok) {
                    const data = await res.json();
                    const enabled = data.ai_insight_enabled === 'true';
                    setAiEnabled(enabled);
                    setInsightMode(data.ai_insight_mode || 'ai-with-fallback');
                } else {
                    setAiEnabled(false);
                }
            } catch {
                setAiEnabled(false);
            }
        }
        loadSettings();
    }, []);

    const fetchInsight = useCallback(async (
        p: string,
        cmp: boolean,
        forceRefresh = false,
    ) => {
        // Client-side cache check (only if not force refresh)
        if (!forceRefresh) {
            const cached = getClientCached(p, cmp);
            if (cached) {
                setInsight(cached);
                setAiEnabled(true);
                generateDynamicSuggestions(p, cached);
                return;
            }
        }

        // Clear transient fetch errors on retry — aiEnabled stays as config-truth
        setFetchError(null);
        setError(null);
        setLoading(true);
        setDynamicSuggestions([]);

        try {
            const res = await fetch('/api/ai/insight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page,
                    prompt: p,
                    title,
                    rangePreset,
                    startDate,
                    endDate,
                    comparisonMode,
                    comparisonStartDate,
                    comparisonEndDate,
                    reportPeriodMode,
                    withCompare: cmp,
                    forceRefresh,
                }),
            });

            if (!res.ok) {
                // Transient server error — compact banner, don't touch aiEnabled
                setFetchError('Gagal menghubungi server insight');
                setLoading(false);
                return;
            }

            const data = await res.json();

            // Insight disabled from server (redundant check) — compact banner
            if (data.disabled) {
                setFetchError('Insight tidak tersedia');
                setLoading(false);
                return;
            }

            // AI error with fallback flag → transient fetch error
            if (data.error && data.fallback) {
                setFetchError(data.message || 'Gagal mendapatkan insight AI');
                setLoading(false);
                return;
            }

            // AI error without fallback → show error
            if (data.error && !data.fallback) {
                setError(data.message || 'Gagal mendapatkan insight');
                setLoading(false);
                return;
            }

            // Success
            const msg = data.response?.message || data.response?.text || '';
            if (msg) {
                setInsight(msg);
                setClientCache(p, cmp, msg);
                setAiEnabled(true);
                generateDynamicSuggestions(p, msg);
            } else {
                // Empty response — transient, no fallback needed
                setFetchError('Insight kosong');
            }
        } catch (err: any) {
            setFetchError(err.message || 'Gagal menghubungi server');
        } finally {
            setLoading(false);
        }
    }, [page, title, rangePreset, startDate, endDate, comparisonMode, comparisonStartDate, comparisonEndDate, reportPeriodMode, getClientCached, setClientCache]);

    useEffect(() => {
        if (aiEnabled !== null) {
            fetchInsight(currentPrompt, compareMode);
        }
        // Only run on mount when aiEnabled is resolved
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiEnabled]);

    /** Generate 2 context-aware follow-up question suggestions */
    const generateDynamicSuggestions = async (originalPrompt: string, insightText: string) => {
        try {
            const suggPrompt = `Kamu adalah KR·AI. Berdasarkan pertanyaan dan jawabannya, hasilkan TEPAT 2 pertanyaan lanjutan yang spesifik dan actionable untuk owner. Kembalikan HANYA 2 baris teks tanpa nomor/bullet.

Pertanyaan: ${originalPrompt.slice(0, 150)}
Insight: ${insightText.slice(0, 300)}

2 pertanyaan:`;

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: suggPrompt }],
                    config: {},
                    memoryContext: '',
                    thinkingMode: 'instant',
                }),
            });

            if (!res.ok) return;
            const data = await res.json();
            const lines = (data.message as string)
                .split('\n')
                .map((l: string) => l.trim().replace(/^[-•\d.)\s]+/, '').trim())
                .filter((l: string) => l.length > 5)
                .slice(0, 2);
            if (lines.length > 0) setDynamicSuggestions(lines);
        } catch {
            // Fallback to static defaults silently
        }
    };

    const handleAlternativeClick = (q: string) => {
        setCurrentPrompt(q);
        setExpanded(false);
        fetchInsight(q, compareMode);
    };

    const handleToggleCompare = () => {
        const next = !compareMode;
        setCompareMode(next);
        fetchInsight(currentPrompt, next);
    };

    // ── Compact disabled banner (aiEnabled=false from config) ──
    if (aiEnabled === false && !loading && !insight) {
        return (
            <div className={`flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 shadow-sm ${className}`}>
                <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                    AI Insights disabled.
                    <a href="/pengaturan" className="font-medium text-amber-900 underline hover:no-underline ml-1">
                        Enable in Settings
                    </a>
                </p>
            </div>
        );
    }

    // Loading state when aiEnabled not yet resolved
    if (aiEnabled === null && !loading) {
        return (
            <div className={`bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 p-4 shadow-sm ${className}`}>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span>Memuat konfigurasi...</span>
                </div>
            </div>
        );
    }

    const isLong = insight && insight.length > 300;
    const displayText = insight && isLong && !expanded ? insight.slice(0, 280) + '...' : insight;

    return (
        <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 shadow-sm ${className}`}>
            <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <h3 className="text-sm font-semibold text-blue-900 truncate">{title}</h3>
                    {compareMode && (
                        <span className="text-[10px] uppercase font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded">
                            +Compare
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleToggleCompare}
                        disabled={loading}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors disabled:opacity-50 ${compareMode
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100'
                            }`}
                        title="Bandingkan dengan periode sebelumnya"
                    >
                        <GitCompareArrows className="w-3 h-3" />
                        <span className="hidden sm:inline">{compareMode ? 'Compare On' : 'vs Sebelumnya'}</span>
                    </button>
                    <button
                        onClick={() => fetchInsight(currentPrompt, compareMode, true)}
                        disabled={loading}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-50"
                        title="Generate ulang (refresh cache)"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Transient fetch error banner (compact) — aiEnabled remains untouched */}
            {fetchError && !loading && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <p className="text-xs text-amber-700">{fetchError}</p>
                        <button
                            onClick={() => fetchInsight(currentPrompt, compareMode, true)}
                            className="ml-auto shrink-0 text-xs font-medium text-amber-700 underline hover:no-underline whitespace-nowrap"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {loading && (
                <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span>Menganalisis data{compareMode ? ' + periode sebelumnya' : ''}...</span>
                </div>
            )}

            {error && !loading && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-xs text-red-700">{error}</span>
                </div>
            )}

            {displayText && !loading && (
                <>
                    <MarkdownRenderer content={displayText} className="text-sm" />
                    {isLong && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {expanded ? 'Lebih sedikit' : 'Selengkapnya'}
                        </button>
                    )}
                </>
            )}

            {/* Force refresh button when insight already loaded */}
            {!loading && insight && (
                <div className="mt-2 flex justify-end">
                    <button
                        onClick={() => fetchInsight(currentPrompt, compareMode, true)}
                        className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
                        title="Generate ulang (abaikan cache)"
                    >
                        <RefreshCw className="w-3 h-3" />
                        <span>Generate ulang</span>
                    </button>
                </div>
            )}

            {/* Dynamic follow-up suggestions */}
            {!loading && insight && (
                <div className="mt-3 pt-3 border-t border-blue-100">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-blue-600 font-medium">Pertanyaan lanjutan:</span>
                    </div>
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                        {(dynamicSuggestions.length > 0 ? dynamicSuggestions : defaultAlternatives).slice(0, 2).map((q) => (
                            <button
                                key={q}
                                onClick={() => handleAlternativeClick(q)}
                                className="text-xs px-3 py-2 bg-white border border-blue-200 rounded-xl text-blue-700 hover:bg-blue-100 transition-colors text-left flex items-start gap-1.5 sm:max-w-xs"
                            >
                                <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span className="line-clamp-2 sm:line-clamp-none">{q}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
