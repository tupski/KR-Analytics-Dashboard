'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Bot, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import AIChatCore, { type ChatMessage } from './AIChatCore';

const STORAGE_KEY = 'kr-ai-config';

export default function AIChatFloat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [hasConfig, setHasConfig] = useState(false);

    // Check if AI is configured whenever the bubble opens
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const c = JSON.parse(stored);
                setHasConfig(!!c.apiKey);
            }
        } catch { }
    }, [isOpen]);

    return (
        <>
            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-[5.5rem] lg:bottom-24 right-4 sm:right-6 w-[360px] sm:w-[420px] h-[540px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-blue-200 flex flex-col z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Bot className="w-5 h-5" />
                            <span className="font-semibold text-sm">Krai</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Fullscreen button */}
                            <Link
                                href="/analytics-ai/chat"
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                title="Buka fullscreen"
                                onClick={() => setIsOpen(false)}
                            >
                                <Maximize2 className="w-4 h-4" />
                            </Link>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {messages.length === 0 && !hasConfig ? (
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                                <div className="text-center py-6">
                                    <Bot className="w-12 h-12 text-blue-300 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-gray-700">AI belum dikonfigurasi.</p>
                                    <Link
                                        href="/analytics-ai"
                                        className="mt-3 inline-block text-xs text-blue-600 hover:underline"
                                    >
                                        Klik di sini untuk setup API key →
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <AIChatCoreFloat
                                messages={messages}
                                onMessagesChange={setMessages}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(v => !v)}
                className={`fixed bottom-20 lg:bottom-6 right-4 sm:right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-50 ${!isOpen ? 'pulse-glow' : ''}`}
                title="Krai - AI Assistant"
            >
                {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-7 h-7" />}
            </button>
        </>
    );
}

/**
 * Thin wrapper that connects AIChatCore to a custom window event,
 * so other parts of the UI can inject questions without prop-drilling.
 */
function AIChatCoreFloat({
    messages,
    onMessagesChange,
}: {
    messages: ChatMessage[];
    onMessagesChange: (msgs: ChatMessage[]) => void;
}) {
    const sendRef = useRef<((q: string) => void) | null>(null);

    useEffect(() => {
        const handler = (e: Event) => {
            sendRef.current?.((e as CustomEvent<string>).detail);
        };
        window.addEventListener('ai-chat-float-send', handler);
        return () => window.removeEventListener('ai-chat-float-send', handler);
    }, []);

    return (
        <AIChatCore
            mode="float"
            initialMessages={messages}
            onMessagesChange={onMessagesChange}
            onSendRef={sendRef}
        />
    );
}
