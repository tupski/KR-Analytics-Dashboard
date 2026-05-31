'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Lightbulb, GitCompareArrows, ChevronRight, Zap } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { resolveActive } from '@/lib/ai/config';

/**
 * Generate rule-based insight text based on the page context.
 * Used as fallback when no AI API key is configured.
 */
function getRuleBasedFallback(title: string, prompt: string): string {
    const now = new Date();
    const dayName = now.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
    const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

    if (title.includes('Booking') || prompt.includes('booking')) {
        return `📊 **Insight Rule-based** (${dayName}, ${dateStr})\n\n📈 **Performa Booking Hari Ini:**\n- Periksa jumlah booking hari ini vs rata-rata harian\n- Identifikasi jam check-in tersibuk dari data operasional\n- Lokasi paling aktif biasanya terlihat dari tabel booking\n\n💡 **Rekomendasi:**\n- Pastikan semua unit siap untuk check-in hari ini\n- Review booking yang akan datang 7 hari kedepan\n- Monitor pembatalan yang perlu ditindaklanjuti\n\n⚠️ *Konfigurasi AI API key untuk mendapatkan insight otomatis yang lebih cerdas.*`;
    }

    if (title.includes('Laporan') || prompt.includes('laporan') || prompt.includes('keuangan')) {
        return `📊 **Insight Rule-based** (${dayName}, ${dateStr})\n\n💰 **Ringkasan Keuangan:**\n- Periksa total pendapatan vs bulan sebelumnya\n- Identifikasi kategori pengeluaran terbesar\n- Cek apakah ada tagihan yang belum dibayar\n\n💡 **Rekomendasi:**\n- Review pengeluaran yang melebihi budget\n- Pastikan semua pendapatan tercatat dengan benar\n- Verifikasi tagihan yang jatuh tempo bulan ini\n\n⚠️ *Konfigurasi AI API key untuk mendapatkan insight otomatis yang lebih cerdas.*`;
    }

    if (title.includes('Okupansi') || prompt.includes('okupansi') || prompt.includes('unit')) {
        return `📊 **Insight Rule-based** (${dayName}, ${dateStr})\n\n🏠 **Performa Okupansi:**\n- Periksa tingkat okupansi hari ini vs rata-rata\n- Identifikasi unit yang idle terlalu lama\n- Lihat lokasi dengan okupansi tertinggi dan terendah\n\n💡 **Rekomendasi:**\n- Optimalkan harga untuk unit yang jarang terisi\n- Pertimbangkan promosi untuk meningkatkan okupansi\n- Review maintenance unit yang sering kosong\n\n⚠️ *Konfigurasi AI API key untuk mendapatkan insight otomatis yang lebih cerdas.*`;
    }

    if (title.includes('Customer')) {
        return `📊 **Insight Rule-based** (${dayName}, ${dateStr})\n\n👥 **Analisis Customer:**\n- Periksa jumlah tamu unik bulan ini\n- Identifikasi tamu yang sering kembali (repeat guest)\n- Lihat lokasi favorit berdasarkan data booking\n\n💡 **Rekomendasi:**\n- Beri perhatian khusus pada repeat guest\n- Kumpulkan feedback dari tamu untuk meningkatkan layanan\n- Buat program loyalitas untuk tamu setia\n\n⚠️ *Konfigurasi AI API key untuk mendapatkan insight otomatis yang lebih cerdas.*`;
    }

    return `📊 **Insight Rule-based** (${dayName}, ${dateStr})\n\n📈 **Ringkasan Performa:**\n- Periksa metrik utama: booking, pendapatan, okupansi\n- Bandingkan dengan periode sebelumnya menggunakan fitur "Bandingkan"\n- Review aktivitas check-in dan check-out hari ini\n\n💡 **Rekomendasi:**\n- Monitor unit yang tersedia untuk antisipasi permintaan\n- Pastikan semua data tercatat dengan benar\n- Review tren mingguan untuk perencanaan\n\n⚠️ *Konfigurasi AI API key di Pengaturan untuk mendapatkan insight AI otomatis.*`;
}

interface AIInsightCardProps {
    prompt: string;
    title?: string;
    className?: string;
    alternativeQuestions?: string[];
}

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
    const [hasCheckedConfig, setHasCheckedConfig] = useState(false);
    const [insight, setInsight] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasConfig, setHasConfig] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState(prompt);
    const [compareMode, setCompareMode] = useState(false);
    const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);

    const defaultAlternatives = alternativeQuestions || [
        'Apa yang perlu diperhatikan hari ini?',
        'Berikan rekomendasi untuk meningkatkan pendapatan.',
        'Performa minggu ini vs minggu lalu.',
    ];

    const getCacheKey = (p: string, withCompare: boolean) =>
        CACHE_PREFIX + btoa(encodeURIComponent(p + (withCompare ? '|cmp' : ''))).slice(0, 32);

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
                generateDynamicSuggestions(p, cached);
                return;
            }
        }

        setLoading(true);
        setError(null);
        setDynamicSuggestions([]);

        try {
            const resolved = resolveActive(withCompare ? 'thinking' : 'auto', false);
            if (!resolved) {
                setHasConfig(false);
                setLoading(false);
                return;
            }
            const finalPrompt = withCompare ? p + COMPARE_PROMPT_SUFFIX : p;
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: finalPrompt }],
                    config: {
                        provider: resolved.providerId,
                        apiKey: resolved.conf.apiKey,
                        model: resolved.modelId,
                        baseUrl: resolved.conf.baseUrl,
                    },
                    contextOptions: { includeHistory: withCompare },
                    thinkingMode: withCompare ? 'thinking' : 'auto',
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setInsight(data.message);
                setCachedInsight(p, withCompare, data.message);
                setHasConfig(true);
                generateDynamicSuggestions(p, data.message);
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

    /** Generate 2 context-aware follow-up question suggestions */
    const generateDynamicSuggestions = async (originalPrompt: string, insightText: string) => {
        try {
            const resolved = resolveActive('instant', false);
            if (!resolved) return;

            const suggPrompt = `Kamu adalah KR·AI. Berdasarkan pertanyaan dan jawabannya, hasilkan TEPAT 2 pertanyaan lanjutan yang spesifik dan actionable untuk owner. Kembalikan HANYA 2 baris teks tanpa nomor/bullet.

Pertanyaan: ${originalPrompt.slice(0, 150)}
Insight: ${insightText.slice(0, 300)}

2 pertanyaan:`;

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: suggPrompt }],
                    config: {
                        provider: resolved.providerId,
                        apiKey: resolved.conf.apiKey,
                        model: resolved.modelId,
                        baseUrl: resolved.conf.baseUrl,
                    },
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

    if (!hasConfig && !loading) {
        // Show rule-based fallback instead of hiding the card entirely
        if (!hasCheckedConfig) {
            setHasCheckedConfig(true);
        }
        const fallbackText = getRuleBasedFallback(title, prompt);
        return (
            <div className={`bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-200 p-4 shadow-sm ${className}`}>
                <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                        <h3 className="text-sm font-semibold text-amber-900 truncate">{title}</h3>
                        <span className="text-[10px] uppercase font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded">
                            Rule-based
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <a
                            href="/pengaturan"
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-white text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                            <Zap className="w-3 h-3" />
                            <span className="hidden sm:inline">Setup AI</span>
                        </a>
                    </div>
                </div>
                <div className="text-sm text-amber-800 leading-relaxed whitespace-pre-wrap">{fallbackText}</div>
                <div className="mt-3 pt-3 border-t border-amber-100">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb className="w-3 h-3 text-amber-500" />
                        <span className="text-xs text-amber-600 font-medium">Tips:</span>
                    </div>
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                        {(alternativeQuestions || [
                            'Apa yang perlu diperhatikan hari ini?',
                            'Berikan rekomendasi untuk meningkatkan pendapatan.',
                        ]).slice(0, 2).map((q) => (
                            <div
                                key={q}
                                className="text-xs px-3 py-2 bg-white border border-amber-200 rounded-xl text-amber-700 text-left flex items-start gap-1.5 sm:max-w-xs"
                            >
                                <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span>{q}</span>
                            </div>
                        ))}
                    </div>
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

            {/* Dynamic follow-up suggestions — max 2, full text on desktop, truncated on mobile */}
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
                                {/* Full text on sm+, max 2 lines on mobile */}
                                <span className="line-clamp-2 sm:line-clamp-none">{q}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
