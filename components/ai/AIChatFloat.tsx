'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Bot } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    typed?: boolean; // true = already fully displayed
}

const STORAGE_KEY = 'kr-ai-config';

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

        const speed = 10; // ms per character
        const timer = setInterval(() => {
            if (doneRef.current) return;
            iRef.current++;
            if (iRef.current <= content.length) {
                setDisplayed(content.slice(0, iRef.current));
                if (iRef.current % 8 === 0) {
                    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                doneRef.current = true;
                setDone(true);
                clearInterval(timer);
                onDone();
            }
        }, speed);

        return () => {
            clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content]);

    return <MarkdownRenderer content={displayed} partial={!done} />;
}

export default function AIChatFloat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [includeHistory, setIncludeHistory] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

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

    const markLastMessageTyped = useCallback(() => {
        setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
                updated[updated.length - 1] = { ...updated[updated.length - 1], typed: true };
            }
            return updated;
        });
    }, []);

    const handleSend = async (text?: string) => {
        const msg = text || input.trim();
        if (!msg || loading) return;

        const userMessage: Message = { role: 'user', content: msg, typed: true };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setError(null);
        setLoading(true);

        try {
            const config = getConfig();
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    config: {
                        provider: config.provider === 'custom' ? 'openai-compatible' : config.provider,
                        apiKey: config.apiKey,
                        model: config.model,
                        baseUrl: config.baseUrl || undefined,
                    },
                    contextOptions: { includeHistory },
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages([...newMessages, { role: 'assistant', content: data.message, typed: false }]);
            } else {
                const err = await res.json();
                setError(err.error || 'Gagal mendapatkan response dari AI');
            }
        } catch (err: any) {
            setError(`Gagal: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-[5.5rem] lg:bottom-24 right-4 sm:right-6 w-[360px] sm:w-[420px] h-[520px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-blue-200 flex flex-col z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
                        <div className="flex items-center gap-2">
                            <Bot className="w-5 h-5" />
                            <span className="font-semibold text-sm">AI Assistant</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIncludeHistory(v => !v)}
                                className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors ${includeHistory
                                    ? 'bg-white text-blue-700'
                                    : 'bg-blue-700/40 text-white hover:bg-blue-700/60'
                                    }`}
                                title={includeHistory
                                    ? 'AI menyertakan data historis dalam konteks'
                                    : 'AI hanya pakai konteks minimal'}
                            >
                                {includeHistory ? 'History On' : 'History Off'}
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-500 text-sm py-6">
                                <Bot className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                                <p className="font-medium text-gray-700">Halo! Saya AI Assistant Kakarama.</p>
                                <p className="mt-1 text-gray-500 text-xs">
                                    Tanyakan apa saja tentang data bisnis — saya punya akses langsung ke database.
                                </p>
                                <div className="mt-4 space-y-2">
                                    {[
                                        'Berapa pendapatan hari ini vs kemarin?',
                                        'Bandingkan minggu ini dengan minggu lalu',
                                        'Lokasi mana yang paling ramai 30 hari terakhir?',
                                        'Tampilkan top 5 tamu repeat bulan ini',
                                    ].map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => handleSend(q)}
                                            className="block w-full text-left px-3 py-2 text-xs bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-700 transition-colors border border-blue-100"
                                        >
                                            💡 {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                                        <Bot className="w-3.5 h-3.5 text-blue-600" />
                                    </div>
                                )}
                                <div
                                    className={`max-w-[85%] px-3 py-2.5 rounded-xl text-sm ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap'
                                        : 'bg-white text-gray-800 rounded-bl-sm border border-gray-200 shadow-sm'
                                        }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        msg.typed ? (
                                            <MarkdownRenderer content={msg.content} />
                                        ) : (
                                            <TypingMessage
                                                content={msg.content}
                                                onDone={markLastMessageTyped}
                                                scrollRef={messagesEndRef}
                                            />
                                        )
                                    ) : (
                                        <span>{msg.content}</span>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0">
                                    <Bot className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <div className="bg-white px-4 py-2.5 rounded-xl rounded-bl-sm border border-gray-200 shadow-sm flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    <span className="text-xs text-gray-500 ml-1">Mengambil data...</span>
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

                    {/* Input */}
                    <div className="border-t border-gray-200 p-3 bg-white">
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Tanya tentang data bisnis..."
                                disabled={loading}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50 bg-slate-50"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={loading || !input.trim()}
                                className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-20 lg:bottom-6 right-4 sm:right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-50 ${!isOpen ? 'pulse-glow' : ''}`}
                title="AI Assistant"
            >
                {isOpen ? (
                    <X className="w-6 h-6" />
                ) : (
                    <Bot className="w-7 h-7" />
                )}
            </button>
        </>
    );
}
