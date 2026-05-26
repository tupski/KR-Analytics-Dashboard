'use client';

/**
 * AIChatCore — shared chat engine for both AIChatFloat and the full-screen Krai page.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, Loader2, ChevronRight, Brain, X } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { loadMemory, addMemory, deleteMemory, getMemoryContext, type MemoryEntry } from '@/lib/ai/memory';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    typed?: boolean;
    suggestions?: string[];
}

const STORAGE_KEY = 'kr-ai-config';

// ── Typing animation ─────────────────────────────────────────────────────────

function TypingMessage({
    content,
    onDone,
    scrollRef,
}: {
    content: string;
    onDone: () => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
    const [displayed, setDisplayed] = useState('');
    const [done, setDone] = useState(false);
    const iRef = useRef(0);
    const doneRef = useRef(false);

    useEffect(() => {
        iRef.current = 0;
        doneRef.current = false;
        setDisplayed('');
        setDone(false);

        const speed = 8;
        const timer = setInterval(() => {
            if (doneRef.current) return;
            iRef.current++;
            if (iRef.current <= content.length) {
                setDisplayed(content.slice(0, iRef.current));
                if (iRef.current % 10 === 0) {
                    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                doneRef.current = true;
                setDone(true);
                clearInterval(timer);
                onDone();
            }
        }, speed);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content]);

    return <MarkdownRenderer content={displayed} partial={!done} />;
}

// ── API helpers ───────────────────────────────────────────────────────────────

function getConfig() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const c = JSON.parse(stored);
            if (c.apiKey) return c;
        }
    } catch { }
    return { provider: '', apiKey: '', model: '', baseUrl: '' };
}

async function sendChat(
    messages: { role: string; content: string }[],
    memoryContext: string,
): Promise<string> {
    const config = getConfig();
    const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages,
            config: {
                provider: config.provider === 'custom' ? 'openai-compatible' : config.provider,
                apiKey: config.apiKey,
                model: config.model,
                baseUrl: config.baseUrl || undefined,
            },
            memoryContext,
        }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.message;
}

async function fetchFollowUpSuggestions(
    userQuestion: string,
    aiAnswer: string,
): Promise<string[]> {
    try {
        const config = getConfig();
        if (!config.apiKey) return [];

        const prompt = `Kamu adalah Krai, AI Business Copilot Kakarama Room. Berdasarkan konteks percakapan berikut, hasilkan TEPAT 2 pertanyaan lanjutan yang akan membantu owner mendapat insight bisnis yang lebih dalam atau actionable. Pertanyaan harus spesifik, berbasis data, dan relevan dengan konteks. Kembalikan HANYA 2 baris teks biasa tanpa nomor/bullet/prefix apapun.

Pertanyaan user: ${userQuestion.slice(0, 200)}
Jawaban Krai: ${aiAnswer.slice(0, 400)}

2 pertanyaan lanjutan:`;

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
                memoryContext: '',
            }),
        });

        if (!res.ok) return [];
        const data = await res.json();
        const lines = (data.message as string)
            .split('\n')
            .map((l: string) => l.trim().replace(/^[-•\d.)\s]+/, '').trim())
            .filter((l: string) => l.length > 5)
            .slice(0, 2);
        return lines;
    } catch {
        return [];
    }
}

// ── Memory panel ─────────────────────────────────────────────────────────────

function MemoryPanel({ onClose }: { onClose: () => void }) {
    const [entries, setEntries] = useState<MemoryEntry[]>([]);
    const [draft, setDraft] = useState('');

    useEffect(() => { setEntries(loadMemory()); }, []);

    const handleAdd = () => {
        if (!draft.trim()) return;
        const e = addMemory(draft);
        setEntries(prev => [...prev, e]);
        setDraft('');
    };

    const handleDelete = (id: string) => {
        deleteMemory(id);
        setEntries(prev => prev.filter(e => e.id !== id));
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-blue-600" />
                        <h2 className="font-semibold text-gray-900 text-sm">Memori Krai</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {entries.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-6">
                            Belum ada memori. Tambahkan fakta atau konteks yang ingin Krai ingat.
                        </p>
                    )}
                    {entries.map(e => (
                        <div key={e.id} className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                            <p className="flex-1 text-xs text-gray-700 leading-relaxed">{e.text}</p>
                            <button
                                onClick={() => handleDelete(e.id)}
                                className="flex-shrink-0 p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="px-4 pb-4 border-t border-gray-200 pt-3">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                            placeholder="Contoh: Fokus analisis ke lokasi Bintaro"
                            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!draft.trim()}
                            className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            Simpan
                        </button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                        Krai akan selalu mengingat catatan ini di setiap percakapan. Max 30 entri.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface AIChatCoreProps {
    mode: 'float' | 'full';
    initialMessages?: ChatMessage[];
    onMessagesChange?: (msgs: ChatMessage[]) => void;
    onOpenFullscreen?: () => void;
    onSendRef?: React.MutableRefObject<((q: string) => void) | null>;
    /** Show memory button in toolbar */
    showMemoryButton?: boolean;
}

export default function AIChatCore({
    mode,
    initialMessages = [],
    onMessagesChange,
    onSendRef,
    showMemoryButton = false,
}: AIChatCoreProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [toolStatus, setToolStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showMemory, setShowMemory] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const onMessagesChangeRef = useRef(onMessagesChange);
    onMessagesChangeRef.current = onMessagesChange;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        onMessagesChangeRef.current?.(messages);
    }, [messages]);

    const markLastTyped = useCallback(() => {
        setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
                updated[updated.length - 1] = { ...updated[updated.length - 1], typed: true };
            }
            return updated;
        });
    }, []);

    const addSuggestions = useCallback((userQ: string, aiAnswer: string) => {
        fetchFollowUpSuggestions(userQ, aiAnswer).then(suggestions => {
            if (suggestions.length === 0) return;
            setMessages(prev => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].role === 'assistant') {
                        updated[i] = { ...updated[i], suggestions };
                        break;
                    }
                }
                return updated;
            });
        });
    }, []);

    const handleSend = useCallback(async (text?: string) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;

        const userMessage: ChatMessage = { role: 'user', content: msg, typed: true };
        const newMessages: ChatMessage[] = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setError(null);
        setLoading(true);
        setToolStatus('Mengambil data dari database...');

        try {
            const memCtx = getMemoryContext();
            const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
            const response = await sendChat(apiMessages, memCtx);
            setToolStatus(null);
            const assistantMsg: ChatMessage = { role: 'assistant', content: response, typed: false };
            setMessages([...newMessages, assistantMsg]);
            setTimeout(() => addSuggestions(msg, response), 1200);
        } catch (err: any) {
            setToolStatus(null);
            setError(err.message || 'Gagal menghubungi Krai');
        } finally {
            setLoading(false);
        }
    }, [input, loading, messages, addSuggestions]);

    // Expose send function via ref
    useEffect(() => {
        if (onSendRef) onSendRef.current = (q: string) => handleSend(q);
    }, [handleSend, onSendRef]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const isFloat = mode === 'float';
    const isFull = mode === 'full';

    return (
        <div className="flex flex-col h-full">
            {/* Memory panel overlay */}
            {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}

            {/* Message list */}
            <div className={`flex-1 overflow-y-auto ${isFloat ? 'p-3 space-y-3 bg-slate-50' : 'px-4 py-4 space-y-4 bg-slate-50/50'}`}>
                {messages.length === 0 && !loading && (
                    <div className={`text-center ${isFloat ? 'py-6' : 'py-8'}`}>
                        <div className={`bg-gradient-to-br from-blue-600 to-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 ${isFloat ? 'w-10 h-10' : 'w-14 h-14'}`}>
                            <Bot className={`text-white ${isFloat ? 'w-5 h-5' : 'w-7 h-7'}`} />
                        </div>
                        <p className={`font-semibold text-gray-800 ${isFull ? 'text-base' : 'text-sm'}`}>Halo, saya Krai. Saya Asisten AI Kakarama Room.</p>
                        <p className="mt-1 text-gray-500 text-xs">Tanyakan apa aja tentang laporan bisnis Kakarama Room.</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className="space-y-1.5">
                        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && (
                                <div className={`rounded-xl bg-blue-600 flex items-center justify-center mr-2 flex-shrink-0 mt-1 ${isFloat ? 'w-6 h-6' : 'w-7 h-7'}`}>
                                    <Bot className={`text-white ${isFloat ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                                </div>
                            )}
                            <div
                                className={`rounded-xl text-sm shadow-sm max-w-[85%] ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap px-3 py-2'
                                    : `bg-white text-gray-800 rounded-bl-sm border border-gray-200 ${isFloat ? 'px-3 py-2.5' : 'px-4 py-3'}`
                                    }`}
                            >
                                {msg.role === 'assistant' ? (
                                    msg.typed ? (
                                        <MarkdownRenderer content={msg.content} />
                                    ) : (
                                        <TypingMessage
                                            content={msg.content}
                                            onDone={markLastTyped}
                                            scrollRef={messagesEndRef}
                                        />
                                    )
                                ) : (
                                    <span>{msg.content}</span>
                                )}
                            </div>
                        </div>

                        {/* Dynamic follow-up suggestions */}
                        {msg.role === 'assistant' && msg.typed && msg.suggestions && msg.suggestions.length > 0 && (
                            <div className={`flex flex-wrap gap-1.5 ${isFloat ? 'pl-8' : 'pl-9'}`}>
                                {msg.suggestions.map((q, qi) => (
                                    <button
                                        key={qi}
                                        onClick={() => handleSend(q)}
                                        disabled={loading}
                                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full text-blue-700 transition-colors disabled:opacity-50 max-w-[220px] text-left"
                                    >
                                        <ChevronRight className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate">{q}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start items-start gap-2">
                        <div className={`rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 ${isFloat ? 'w-6 h-6' : 'w-7 h-7'}`}>
                            <Bot className={`text-white ${isFloat ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm shadow-sm px-3 py-2 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
                            <span className="text-xs text-gray-500">{toolStatus || 'Memproses...'}</span>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className={`border-t border-gray-100 bg-white ${isFloat ? 'p-2.5' : 'px-4 py-3'}`}>
                {showMemoryButton && (
                    <div className={`flex justify-end mb-2 ${isFull ? 'max-w-3xl mx-auto' : ''}`}>
                        <button
                            onClick={() => setShowMemory(true)}
                            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                        >
                            <Brain className="w-3 h-3" />
                            Memori
                        </button>
                    </div>
                )}
                <div className={`flex gap-2 ${isFull ? 'max-w-3xl mx-auto' : ''}`}>
                    {isFull ? (
                        <textarea
                            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Tanya Krai tentang data bisnis... (Enter kirim, Shift+Enter baris baru)"
                            disabled={loading}
                            rows={2}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50 resize-none bg-white"
                        />
                    ) : (
                        <input
                            ref={inputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Tanya Krai..."
                            disabled={loading}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50 bg-white"
                        />
                    )}
                    <button
                        onClick={() => handleSend()}
                        disabled={loading || !input.trim()}
                        className={`bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 ${isFull ? 'px-4 py-2' : 'p-2 rounded-lg'}`}
                    >
                        <Send className={isFull ? 'w-4 h-4' : 'w-4 h-4'} />
                    </button>
                </div>
                {isFull && (
                    <p className="text-center text-[10px] text-gray-400 mt-1.5 max-w-3xl mx-auto">
                        Krai memiliki akses baca ke database Kakarama Room secara real-time.
                    </p>
                )}
            </div>
        </div>
    );
}
