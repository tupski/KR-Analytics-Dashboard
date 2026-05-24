'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Brain, Loader2 } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const STORAGE_KEY = 'kr-ai-config';

export default function AIChatFloat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const getConfig = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch { }
        return null;
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const config = getConfig();
        if (!config || !config.apiKey) {
            setError('Belum ada konfigurasi AI. Buka halaman Analytics AI untuk setup.');
            return;
        }

        const userMessage: Message = { role: 'user', content: input.trim() };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setError(null);
        setLoading(true);

        try {
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
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages([...newMessages, { role: 'assistant', content: data.message }]);
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
                <div className="fixed bottom-20 right-4 sm:right-6 w-[360px] sm:w-[400px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                        <div className="flex items-center gap-2">
                            <Brain className="w-5 h-5" />
                            <span className="font-semibold text-sm">AI Insight</span>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-500 text-sm py-8">
                                <Brain className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                                <p className="font-medium">Halo! Saya AI Assistant Kakarama.</p>
                                <p className="mt-1">Tanyakan apa saja tentang data bisnis Anda.</p>
                                <div className="mt-4 space-y-2">
                                    {['Berapa okupansi saat ini?', 'Bagaimana pendapatan hari ini?', 'Lokasi mana yang paling ramai?'].map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => { setInput(q); }}
                                            className="block w-full text-left px-3 py-2 text-xs bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors"
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
                                <div
                                    className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                        }`}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 px-4 py-2 rounded-xl rounded-bl-sm">
                                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                {error}
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-gray-200 p-3">
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Tanya tentang data bisnis..."
                                disabled={loading}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none disabled:opacity-50"
                            />
                            <button
                                onClick={handleSend}
                                disabled={loading || !input.trim()}
                                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="fixed bottom-4 right-4 sm:right-6 w-14 h-14 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center z-50"
                title="AI Insight Chat"
            >
                {isOpen ? (
                    <X className="w-6 h-6" />
                ) : (
                    <MessageCircle className="w-6 h-6" />
                )}
            </button>
        </>
    );
}
