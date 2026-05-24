'use client';

import { useState, useEffect } from 'react';
import { Brain, RefreshCw, Sparkles } from 'lucide-react';

interface AIInsightCardProps {
    prompt: string;
    title?: string;
    className?: string;
}

const STORAGE_KEY = 'kr-ai-config';

/**
 * AIInsightCard - Displays an automatic AI-generated insight
 * 
 * Fetches an AI insight based on the provided prompt.
 * Shows loading state, error state, and the AI response.
 * Only fetches if AI is configured (API key exists).
 */
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
        return null;
    };

    const fetchInsight = async () => {
        const config = getConfig();
        if (!config) {
            setHasConfig(false);
            return;
        }
        setHasConfig(true);
        setLoading(true);
        setError(null);

        try {
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
            } else {
                const data = await res.json();
                setError(data.error || 'Gagal mendapatkan insight');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Check if config exists on mount
        const config = getConfig();
        setHasConfig(!!config);

        // Auto-fetch insight if configured
        if (config) {
            fetchInsight();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!hasConfig) {
        return null; // Don't show if AI not configured
    }

    return (
        <div className={`bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-4 shadow-sm ${className}`}>
            <div className="flex items-center justify-between mb-2">
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
                <div className="flex items-center gap-2 text-sm text-purple-600">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    <span className="ml-1">Menganalisis data...</span>
                </div>
            )}

            {error && (
                <p className="text-xs text-red-600">{error}</p>
            )}

            {insight && !loading && (
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{insight}</p>
            )}
        </div>
    );
}
