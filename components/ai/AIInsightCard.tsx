'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Lightbulb, GitCompareArrows, ChevronRight, Zap, AlertCircle } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { KraiThinkingSteps } from './KraiThinkingSteps';
import { generateFollowUpQuestions } from '@/lib/ai/followUpQuestions';
import type { KraiPageContext } from '@/lib/ai/followUpQuestions';
import { normalizeAiText } from '@/lib/ai/normalizeAiText';
import { suggestionToUserPrompt } from '@/lib/ai/suggestionHelper';
import { parseKraiResponse, splitThinkingSteps } from '@/lib/ai/kraiResponseParser';

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
    /** Called when user clicks follow-up — sends question to KRAI chat */
    onFollowUpClick?: (question: string) => void;
}

const CACHE_PREFIX = 'kr-ai-insight-client-';
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 min client-side fallback

export default function AIInsightCard({
    prompt,
    title = 'KRAI Insight',
    className = '',
    alternativeQuestions: _alternativeQuestions,
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
    const [_insightMode, setInsightMode] = useState<string>('ai-with-fallback');
    const [expanded, setExpanded] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState(prompt);
    const [compareMode, setCompareMode] = useState(false);
    const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
    const [expandedSugg, setExpandedSugg] = useState<Record<string, boolean>>({});
    const initialFetchDone = useRef(false);

    // Inline follow-up Q&A state
    const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);
    const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null);
    const [followUpLoading, setFollowUpLoading] = useState(false);
    const [followUpError, setFollowUpError] = useState<string | null>(null);

    // Client-side cache helpers (secondary cache — primary is server-side)
    const getClientCacheKey = useCallback((p: string, cmp: boolean) =>
        CACHE_PREFIX + btoa(encodeURIComponent(page + '|' + p + (cmp ? '|cmp' : ''))).slice(0, 32),
        [page]);

    const getClientCached = useCallback((p: string, cmp: boolean): string | null => {
        try {
            const raw = sessionStorage.getItem(getClientCacheKey(p, cmp));
            if (raw) {
                const { text, timestamp } = JSON.parse(raw);
                if (Date.now() - timestamp < CLIENT_CACHE_TTL) return text;
            }
        } catch { }
        return null;
    }, [getClientCacheKey]);

    const setClientCache = useCallback((p: string, cmp: boolean, text: string) => {
        try {
            sessionStorage.setItem(
                getClientCacheKey(p, cmp),
                JSON.stringify({ text, timestamp: Date.now() }),
            );
        } catch { }
    }, [getClientCacheKey]);

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

    /** Generate follow-up questions from shared lib (no LLM call) */
    const generateDynamicSuggestions = useCallback((_originalPrompt: string, insightText: string) => {
        const qs = generateFollowUpQuestions({
            pageContext: (page as KraiPageContext) || 'dashboard',
            insightText,
            hasComparison: !!comparisonMode && comparisonMode !== 'none',
            hasActiveFilters: !!rangePreset || !!startDate,
        });
        setDynamicSuggestions(qs);
    }, [page, comparisonMode, rangePreset, startDate]);

    const fetchInsight = useCallback(async (
        p: string,
        cmp: boolean,
        forceRefresh = false,
    ) => {
        // Client-side cache check (only if not force refresh)
        if (!forceRefresh) {
            const cached = getClientCached(p, cmp);
            if (cached) {
                const normalized = normalizeAiText(cached);
                setInsight(normalized);
                setClientCache(p, cmp, normalized);
                setAiEnabled(true);
                generateDynamicSuggestions(p, normalized);
                return;
            }
        }

        setFetchError(null);
        setError(null);
        setLoading(true);
        setDynamicSuggestions([]);
        // Reset follow-up state when fetching new insight
        setFollowUpQuestion(null);
        setFollowUpAnswer(null);
        setFollowUpError(null);

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
                setFetchError('KRAI mengalami kendala. Coba segarkan kembali.');
                setLoading(false);
                return;
            }

            const data = await res.json();

            if (data.disabled) {
                setFetchError('Insight tidak tersedia');
                setLoading(false);
                return;
            }

            if (data.error && data.fallback) {
                setFetchError(data.message || 'KRAI mengalami kendala. Coba segarkan kembali.');
                setLoading(false);
                return;
            }

            if (data.error && !data.fallback) {
                setError(data.message || 'KRAI mengalami kendala. Coba segarkan kembali.');
                setLoading(false);
                return;
            }

            // Success — normalize to ensure no raw JSON passes through
            const raw = data.response?.message || data.response?.text || '';
            const msg = normalizeAiText(raw);
            if (msg) {
                setInsight(msg);
                setClientCache(p, cmp, msg);
                setAiEnabled(true);
                generateDynamicSuggestions(p, msg);
            } else {
                setFetchError('Insight belum selesai dibuat. Coba segarkan kembali.');
            }
        } catch (err: any) {
            setFetchError(err.message || 'KRAI mengalami kendala. Coba segarkan kembali.');
        } finally {
            setLoading(false);
        }
    }, [page, title, rangePreset, startDate, endDate, comparisonMode, comparisonStartDate, comparisonEndDate, reportPeriodMode, getClientCached, setClientCache, generateDynamicSuggestions]);

    // Fetch insight once on mount when aiEnabled resolves
    useEffect(() => {
        if (aiEnabled !== null && !initialFetchDone.current) {
            initialFetchDone.current = true;
            fetchInsight(currentPrompt, compareMode);
        }
    }, [aiEnabled, fetchInsight, currentPrompt, compareMode]);

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

    /** Inline follow-up: generate answer inside the card via streaming chat API */
    const [followUpThinkingSteps, setFollowUpThinkingSteps] = useState<string[]>([]);

    const handleFollowUpQuestion = async (q: string) => {
        setFollowUpQuestion(q);
        setFollowUpAnswer(null);
        setFollowUpError(null);
        setFollowUpThinkingSteps([]);
        setFollowUpLoading(true);

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'user', content: `Berdasarkan insight berikut:\n\n${insight}\n\nJawab pertanyaan ini: ${q}` },
                    ],
                    config: {
                        provider: 'auto',
                        model: 'auto',
                    },
                    stream: true,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Gagal: ${res.status}`);
            }

            // Try NDJSON streaming
            const reader = res.body?.getReader();
            if (reader) {
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
                                    setFollowUpThinkingSteps(splitThinkingSteps(accumulatedThinking));
                                    break;
                                case 'answer':
                                    accumulatedAnswer += event.delta || '';
                                    setFollowUpAnswer(accumulatedAnswer);
                                    break;
                                case 'done':
                                    setFollowUpAnswer(normalizeAiText(accumulatedAnswer || 'Insight sedang dibuat. Tunggu sebentar dulu, lalu coba lagi.'));
                                    setFollowUpThinkingSteps(splitThinkingSteps(accumulatedThinking));
                                    setFollowUpLoading(false);
                                    break;
                                case 'error':
                                    setFollowUpError(event.message || 'Terjadi kesalahan.');
                                    setFollowUpLoading(false);
                                    break;
                            }
                        } catch { /* skip */ }
                    }
                }
                return;
            }

            // Non-streaming fallback with parseKraiResponse
            const data = await res.json();
            const parsed = parseKraiResponse(data.message || '');
            setFollowUpAnswer(parsed.answer || 'Tidak ada jawaban.');
            setFollowUpThinkingSteps(parsed.thinkingSteps);
        } catch (err: any) {
            setFollowUpError(err.message || 'Gagal menjawab pertanyaan');
        } finally {
            setFollowUpLoading(false);
        }
    };

    // ── Compact disabled banner ──
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

    // Collapse long insight: show max 5 lines
    const LINE_CLAMP_THRESHOLD = 300;
    const isLong = insight && insight.length > LINE_CLAMP_THRESHOLD;
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

            {/* Transient fetch error banner */}
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
                            {expanded ? 'Tutup' : 'Lihat selengkapnya'}
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

            {/* Inline follow-up — question + answer inside card */}
            {!loading && insight && (
                <div className="mt-3 pt-3 border-t border-blue-100">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-blue-600 font-medium">Tanya lanjutan</span>
                    </div>

                    {/* Follow-up question list */}
                    {!followUpQuestion && dynamicSuggestions.length > 0 && (
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                            {dynamicSuggestions.slice(0, 3).map((q: string) => {
                                const suggKey = q.slice(0, 20);
                                const isExpanded = !!expandedSugg[suggKey];
                                const isLong = q.length > 80;
                                return (
                                    <div
                                        key={suggKey}
                                        className="text-xs bg-white border border-blue-200 rounded-xl text-blue-700 transition-colors flex items-start gap-1.5 sm:max-w-xs"
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
                                        {/* Suggestion body — click to generate inline answer */}
                                        <button
                                            onClick={() => {
                                                // Use transformed user prompt for generation
                                                handleFollowUpQuestion(q);
                                            }}
                                            disabled={followUpLoading}
                                            className="flex-1 py-2 pr-3 text-left cursor-pointer min-w-0 disabled:opacity-50"
                                            title={q}
                                        >
                                            <span className={isExpanded ? '' : 'line-clamp-2'}>{q}</span>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Inline follow-up answer */}
                    {followUpQuestion && (
                        <div className="mt-2 space-y-2">
                            <div className="text-xs font-medium text-blue-700 bg-blue-100 px-3 py-1.5 rounded-lg">
                                {followUpQuestion}
                            </div>

                            {/* Thinking steps */}
                            {followUpThinkingSteps.length > 0 && (
                                <KraiThinkingSteps
                                    steps={followUpThinkingSteps}
                                    isStreaming={followUpLoading}
                                    isComplete={!followUpLoading}
                                />
                            )}

                            {followUpLoading && !followUpAnswer && (
                                <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                    <span>Menjawab...</span>
                                </div>
                            )}

                            {followUpError && !followUpLoading && (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-200">
                                    <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                                    <span className="text-xs text-red-700">{followUpError}</span>
                                </div>
                            )}

                            {followUpAnswer && !followUpLoading && (
                                <div className="bg-white border border-blue-100 rounded-lg p-3">
                                    <MarkdownRenderer content={followUpAnswer} className="text-sm" />
                                </div>
                            )}

                            {/* Close follow-up */}
                            {!followUpLoading && (
                                <button
                                    onClick={() => {
                                        setFollowUpQuestion(null);
                                        setFollowUpAnswer(null);
                                        setFollowUpError(null);
                                        setFollowUpThinkingSteps([]);
                                    }}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                    Tutup
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
