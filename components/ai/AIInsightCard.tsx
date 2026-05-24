'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';

interface AIInsightCardProps {
    prompt: string;
    title?: string;
    className?: string;
    alternativeQuestions?: string[];
}

const STORAGE_KEY = 'kr-ai-config';
const CACHE_PREFIX = 'kr-ai-insight-cache-';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function RichText({ text }: { text: string }) {
    const lines = text.split('\n');
    return (
        <div className="text-sm text-gray-700 leading-relaxed space-y-1.5">
            {lines.map((line, i) => {
                if (!line.trim()) return <div key={i} className="h-1" />;
                let formatted = line
                    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-900">$1</strong>')
                    .replace(/__(.+?)__/g, '<strong class="text-gray-900">$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>');

                const numMatch = line.match(/^(\d+)[.)]\s+(.+)/);
                if (numMatch) {
                    return (
                        <div key={i} className="flex gap-2 pl-1">
                            <span className="text-blue-600 font-semibold flex-shrink-0">{numMatch[1]}.</span>
                            <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^\d+[.)]\s+/, '') }} />
                        </div>
                    );
                }
                if (line.match(/^[-•]\s+/)) {
                    return (
                        <div key={i} className="flex gap-2 pl-1">
                            <span className="text-blue-400 flex-shrink-0">•</span>
                            <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-•]\s+/, '') }} />
                        </div>
                    );
                }
                return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
            })}
        </div>
    );
}

export default function AIInsightCard({
    prompt,
    title = 'AI Insight',
    className = '',
    alternativeQuestions,
}: AIInsightCardProps) {
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasConfig, setHasConfig] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState(prompt);

    const defaultAlternatives = alternativeQuestions || [
        'Apa yang perlu diperhatikan hari ini?',
        'Berikan rekomendasi untuk meningkatkan pendapatan.',
        'Bandingkan performa minggu ini vs minggu lalu.',
    ];

    const getCacheKey = (p: string) => CACHE_PREFIX + btoa(encodeURIComponent(p)).slice(0, 32);

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

    const getCachedInsight = (p: string): string | null => {
        try {
            const cached = sessionStorage.getItem(getCacheKey(p));
            if (cached) {
                const { text, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) return text;
            }
        } catch { }
        return null;
    };

    const setCachedInsight = (p: string, text: string) => {
        try {
            sessionStorage.setItem(getCacheKey(p), JSON.stringify({ text, timestamp: Date.now() }));
        } catch { }
    };

    const fetchInsight = async (p: string, forceRefresh = false) => {
        // Check cache first
        if (!forceRefresh) {
            const cached = getCachedInsight(p);
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
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: p }],
                    config: {
                        provider: config.provider === 'custom' ? 'openai-compatible' : config.provider,
                        apiKey: config.apiKey,
                        model: config.model,
                        baseUrl: config.baseUrl || undefined,
                    },
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setInsight(data.message);
                setCachedInsight(p, data.message);
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
        fetchInsight(currentPrompt);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAlternativeClick = (q: string) => {
        setCurrentPrompt(q);
        setExpanded(false);
        fetchInsight(q);
    };

    if (!hasConfig && !loading) return null;

    const isLong = insight && insight.length > 300;
    const displayText = insight && isLong && !expanded ? insight.slice(0, 280) + '...' : insight;

    return (
        <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 shadow-sm ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-blue-900">{title}</h3>
                </div>
                <button
                    onClick={() => fetchInsight(currentPrompt, true)}
                    disabled={loading}
                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-50"
                    title="Refresh insight"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span>Menganalisis data...</span>
                </div>
            )}

            {error && !loading && <p className="text-xs text-red-600">{error}</p>}

            {displayText && !loading && (
                <>
                    <RichText text={displayText} />
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
