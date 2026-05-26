'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Lightbulb, GitCompareArrows } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

interface AIInsightCardProps {
    prompt: string;
    title?: string;
    className?: string;
    alternativeQuestions?: string[];
}

const STORAGE_KEY = 'kr-ai-config';
const CACHE_PREFIX = 'kr-ai-insight-cache-';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const COMPARE_PROMPT_SUFFIX = `

PERMINTAAN TAMBAHAN: Lakukan analisis komparatif dengan periode sebelumnya yang relevan (kemarin, minggu lalu, bulan lalu, atau tahun lalu).
Gunakan tools compare_periods untuk mendapat delta otomatis.
Dalam jawaban:
- Sertakan severity label (🚨/⚠️/✅/📈/🏆) berdasarkan besarnya perubahan
- Jelaskan makna bisnis dari perubahan tersebut, bukan hanya angka
- Identifikasi penyebab potensial dari tren yang terdeteksi
- Beri 1-2 rekomendasi actionable spesifik berdasarkan temuan perbandingan ini`;

export default function AIInsightCard({
    prompt,
    title = 'KR-AI Insight',
    className = '',
    alternativeQuestions,
}: AIInsightCardProps) {
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasConfig, setHasConfig] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState(prompt);
    const [compareMode, setCompareMode] = useState(false);

    const defaultAlternatives = alternativeQuestions || [
        'Apa yang perlu diperhatikan hari ini?',
        'Berikan rekomendasi untuk meningkatkan pendapatan.',
        'Performa minggu ini vs minggu lalu.',
    ];

    const getCacheKey = (p: string, withCompare: boolean) =>
        CACHE_PREFIX + btoa(encodeURIComponent(p + (withCompare ? '|cmp' : ''))).slice(0, 32);

    const getConfig = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const config = JSON.parse(stored);
                if (config.apiKey) return config;
            }
        } catch { }
        return { provider: '', apiKey: '', model: '', baseUrl: '' };
    };

    const getCachedInsight = (p: string, withCompare: boolean): string | null => {
        try {
            const cached = sessionStorage.getItem(getCacheKey(p, withCompare));
            if (cached) {
                const { text, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) return text;
            }
        } catch { }
        return null;
    };

    const setCachedInsight = (p: string, withCompare: boolean, text: string) => {
        try {
            sessionStorage.setItem(getCacheKey(p, withCompare), JSON.stringify({ text, timestamp: Date.now() }));
        } catch { }
    };

    const fetchInsight = async (p: string, withCompare: boolean, forceRefresh = false) => {
        // Check cache first
        if (!forceRefresh) {
            const cached = getCachedInsight(p, withCompare);
            if (cached) {
                setInsight(cached);
                setHasConfig(true);
                return;
            }
        }

        setLoading(true);
        setError(null);

        try {
            const config = getConfig();
            const finalPrompt = withCompare ? p + COMPARE_PROMPT_SUFFIX : p;
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: finalPrompt }],
                    config: {
                        provider: config.provider === 'custom' ? 'openai-compatible' : config.provider,
                        apiKey: config.apiKey,
                        model: config.model,
                        baseUrl: config.baseUrl || undefined,
                    },
                    contextOptions: { includeHistory: withCompare },
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setInsight(data.message);
                setCachedInsight(p, withCompare, data.message);
                setHasConfig(true);
            } else {
                const data = await res.json();
                if (res.status === 400 && data.error?.includes('API key')) {
                    setHasConfig(false);
                } else {
                    setError(data.error || 'Gagal mendapatkan insight');
                    setHasConfig(true);
                }
            }
        } catch (err: any) {
            setError(err.message);
            setHasConfig(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInsight(currentPrompt, compareMode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    if (!hasConfig && !loading) return null;

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
                        title="Refresh insight"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

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

            {error && !loading && <p className="text-xs text-red-600">{error}</p>}

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

            {/* Alternative questions */}
            {!loading && insight && (
                <div className="mt-3 pt-3 border-t border-blue-100">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb className="w-3 h-3 text-blue-500" />
                        <span className="text-xs text-blue-600 font-medium">Pertanyaan lain:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {defaultAlternatives.map((q) => (
                            <button
                                key={q}
                                onClick={() => handleAlternativeClick(q)}
                                className="text-xs px-2.5 py-1 bg-white border border-blue-200 rounded-full text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                {q.length > 40 ? q.slice(0, 37) + '...' : q}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
