'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

interface AIInsightCardProps {
    prompt: string;
    title?: string;
    className?: string;
}

const STORAGE_KEY = 'kr-ai-config';

/**
 * Renders AI text with basic rich formatting:
 * - Lines starting with numbers become list items
 * - Text between *text* becomes italic
 * - Newlines preserved
 */
function RichText({ text }: { text: string }) {
    // Simple rich text: bold (**text** or __text__), bullet points, numbered lists
    const lines = text.split('\n');

    return (
        <div className="text-sm text-gray-700 leading-relaxed space-y-1.5">
            {lines.map((line, i) => {
                if (!line.trim()) return <div key={i} className="h-1" />;

                // Format inline: **bold** → <strong>
                let formatted = line
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/__(.+?)__/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    .replace(/_(.+?)_/g, '<em>$1</em>');

                // Numbered list
                const numMatch = line.match(/^(\d+)[.)]\s+(.+)/);
                if (numMatch) {
                    return (
                        <div key={i} className="flex gap-2 pl-1">
                            <span className="text-purple-600 font-semibold flex-shrink-0">{numMatch[1]}.</span>
                            <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^\d+[.)]\s+/, '') }} />
                        </div>
                    );
                }

                // Bullet list
                if (line.match(/^[-•]\s+/)) {
                    return (
                        <div key={i} className="flex gap-2 pl-1">
                            <span className="text-purple-400 flex-shrink-0">•</span>
                            <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-•]\s+/, '') }} />
                        </div>
                    );
                }

                return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
            })}
        </div>
    );
}

export default function AIInsightCard({ prompt, title = 'AI Insight', className = '' }: AIInsightCardProps) {
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasConfig, setHasConfig] = useState(false);

    const getConfig = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const config = JSON.parse(stored);
                if (config.apiKey) return config;
            }
        } catch { }
        // Return empty to let server use env vars
        return { provider: '', apiKey: '', model: '', baseUrl: '' };
    };

    const fetchInsight = async () => {
        setLoading(true);
        setError(null);

        try {
            const config = getConfig();
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: prompt }],
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
        fetchInsight();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!hasConfig && !loading) {
        return null;
    }

    return (
        <div className={`bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-4 shadow-sm ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <h3 className="text-sm font-semibold text-purple-900">{title}</h3>
                </div>
                <button
                    onClick={fetchInsight}
                    disabled={loading}
                    className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-md transition-colors disabled:opacity-50"
                    title="Refresh insight"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-sm text-purple-600 py-2">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span>Menganalisis data...</span>
                </div>
            )}

            {error && !loading && (
                <p className="text-xs text-red-600">{error}</p>
            )}

            {insight && !loading && <RichText text={insight} />}
        </div>
    );
}
