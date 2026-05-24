'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    isTyping?: boolean;
}

const STORAGE_KEY = 'kr-ai-config';

function TypingMessage({ content }: { content: string }) {
    const [displayed, setDisplayed] = useState('');
    const [done, setDone] = useState(false);

    useEffect(() => {
        let i = 0;
        const speed = 15; // ms per character
        const timer = setInterval(() => {
            if (i < content.length) {
                setDisplayed(content.slice(0, i + 1));
                i++;
            } else {
                setDone(true);
                clearInterval(timer);
            }
        }, speed);
        return () => clearInterval(timer);
    }, [content]);

    const html = displayed
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br/>');

    return (
        <div className="relative">
            <div dangerouslySetInnerHTML={{ __html: html }} />
            {!done && <span className="typing-cursor"></span>}
        </div>
    );
}

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

    const handleSend = async (text?: string) => {
        const msg = text || input.trim();
        if (!msg || loading) return;

        const userMessage: Message = { role: 'user', content: msg };
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
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages([...newMessages, { role: 'assistant', content: data.message, isTyping: true }]);
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
                <div className="fixed bottom-[5.5rem] lg:bottom-24 right-4 sm:right-6 w-[360px] sm:w-[400px] h-[480px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-blue-200 flex flex-col z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white">
                        <div className="flex items-center gap-2">
                            <Bot className="w-5 h-5" />
                            <span className="font-semibold text-sm">AI Assistant</span>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin bg-slate-50">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-500 text-sm py-6">
                                <div className="robot-bounce inline-block mb-3">
                                    <Bot className="w-12 h-12 text-blue-400" />
                                </div>
                                <p className="font-medium text-gray-700">Halo! Saya AI Assistant Kakarama.</p>
                                <p className="mt-1 text-gray-500">Tanyakan apa saja tentang data bisnis.</p>
                                <div className="mt-4 space-y-2">
                                    {['Berapa okupansi saat ini?', 'Bagaimana pendapatan hari ini?', 'Lokasi mana yang paling ramai?'].map((q) => (
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
                                    className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-white text-gray-800 rounded-bl-sm border border-gray-200 shadow-sm'
                                        }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        msg.isTyping ? (
                                            <TypingMessage content={msg.content} />
                                        ) : (
                                            <div dangerouslySetInnerHTML={{
                                                __html: msg.content
                                                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                                    .replace(/__(.+?)__/g, '<strong>$1</strong>')
                                                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                                                    .replace(/\n/g, '<br/>')
                                            }} />
                                        )
                                    ) : (
                                        <span className="whitespace-pre-wrap">{msg.content}</span>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0">
                                    <Bot className="w-3.5 h-3.5 text-blue-600 robot-bounce" />
                                </div>
                                <div className="bg-white px-4 py-2.5 rounded-xl rounded-bl-sm border border-gray-200 shadow-sm">
                                    <span className="typing-cursor text-sm text-gray-500">Mengetik</span>
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

            {/* Floating Button - positioned above mobile nav */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-20 lg:bottom-6 right-4 sm:right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-50 ${!isOpen ? 'pulse-glow' : ''}`}
                title="AI Assistant"
            >
                {isOpen ? (
                    <X className="w-6 h-6" />
                ) : (
                    <Bot className="w-7 h-7 robot-bounce" />
                )}
            </button>
        </>
    );
}
