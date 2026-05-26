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
            {/* Chat Window — full-width on mobile, fixed-width on sm+ */}
            {isOpen && (
                <div className={`
                    fixed z-50 bg-white shadow-2xl border border-blue-200 flex flex-col overflow-hidden
                    /* Mobile: bottom sheet — full width, anchored to bottom, max ~65vh */
                    bottom-0 left-0 right-0 rounded-t-2xl
                    h-[65vh] max-h-[65vh]
                    /* Desktop: floating bubble bottom-right */
                    sm:bottom-6 sm:right-6 sm:left-auto sm:w-[400px] sm:h-[520px] sm:max-h-[calc(100vh-5rem)] sm:rounded-2xl
                `}>
                    {/* Drag handle — mobile only */}
                    <div className="flex justify-center pt-2 pb-1 sm:hidden flex-shrink-0">
                        <div className="w-10 h-1 rounded-full bg-gray-300" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            <span className="font-semibold text-sm">Krai</span>
                        </div>
                        <div className="flex items-center gap-1">
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
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col items-center justify-center text-center">
                                <Bot className="w-10 h-10 text-blue-300 mb-2" />
                                <p className="text-sm font-medium text-gray-700">AI belum dikonfigurasi.</p>
                                <Link
                                    href="/pengaturan"
                                    className="mt-2 inline-block text-xs text-blue-600 hover:underline"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Setup API key di Pengaturan →
                                </Link>
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

            {/* Floating button — bottom-right, above mobile header area */}
            <button
                onClick={() => setIsOpen(v => !v)}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-13 h-13 w-[52px] h-[52px] bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-40"
                title="Krai AI"
            >
                {isOpen ? <X className="w-5 h-5" /> : <Bot className="w-6 h-6" />}
            </button>
        </>
    );
}

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
