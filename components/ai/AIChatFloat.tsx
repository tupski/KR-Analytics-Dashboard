'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { X, Bot, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import AIChatCore, { type ChatMessage } from './AIChatCore';
import { hasConfiguredProviders } from '@/lib/ai/configClient';
import KraiLogo from '@/components/shared/KraiLogo';

const HINT_DISMISSED_KEY = 'kr-ai-hint-dismissed';
const HINT_REMIND_AFTER_DAYS = 3;

export default function AIChatFloat() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [hasConfig, setHasConfig] = useState(false);
    const [showHint, setShowHint] = useState(false);

    // Hide on /chat and /chat/[id] pages
    const isOnChatPage = pathname?.startsWith('/chat');

    useEffect(() => {
        // Check if AI is configured
        async function checkConfig() {
            try {
                const configured = await hasConfiguredProviders();
                setHasConfig(configured);
            } catch { 
                setHasConfig(false);
            }
        }
        checkConfig();

        // Show hint bubble unless dismissed recently
        try {
            const dismissed = localStorage.getItem(HINT_DISMISSED_KEY);
            if (!dismissed) {
                setTimeout(() => setShowHint(true), 1500);
            } else {
                const ts = parseInt(dismissed);
                if (!Number.isNaN(ts) && Date.now() - ts > HINT_REMIND_AFTER_DAYS * 86400000) {
                    setTimeout(() => setShowHint(true), 1500);
                }
            }
        } catch { }
    }, [isOpen]);

    const dismissHint = () => {
        setShowHint(false);
        try { localStorage.setItem(HINT_DISMISSED_KEY, String(Date.now())); } catch { }
    };

    const handleOpenChat = () => {
        dismissHint();
        setIsOpen(true);
    };

    // Don't render on chat pages
    if (isOnChatPage) {
        return null;
    }

    return (
        <>
            {/* Hint bubble — appears on first visit & periodically */}
            {showHint && !isOpen && (
                <div className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-40 max-w-[260px] animate-fade-in">
                    <div className="relative bg-white rounded-2xl rounded-br-sm shadow-xl border border-blue-200 p-3 pr-8">
                        <button
                            onClick={dismissHint}
                            className="absolute top-1 right-1 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            aria-label="Tutup"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-900">
                                    Halo, saya <KraiLogo size="xs" />!
                                </p>
                                <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
                                    Tanyakan apa saja tentang bisnis Kakarama Room — pendapatan, hunian, tren, lokasi.
                                </p>
                                <button
                                    onClick={handleOpenChat}
                                    className="mt-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                                >
                                    Mulai chat →
                                </button>
                            </div>
                        </div>
                        {/* Tail pointing to button */}
                        <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-white border-r border-b border-blue-200 rotate-45" />
                    </div>
                </div>
            )}

            {/* Chat window */}
            {isOpen && (
                <div className="
                    fixed z-50 bg-white shadow-2xl border border-blue-200 flex flex-col overflow-hidden
                    bottom-0 left-0 right-0 rounded-t-2xl h-[70vh] max-h-[70vh]
                    sm:bottom-6 sm:right-6 sm:left-auto sm:w-[420px] sm:h-[560px] sm:max-h-[calc(100vh-5rem)] sm:rounded-2xl
                ">
                    {/* Drag handle (mobile) */}
                    <div className="flex justify-center pt-2 pb-1 sm:hidden flex-shrink-0">
                        <div className="w-10 h-1 rounded-full bg-gray-300" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            <span className="font-semibold text-sm">
                                <span className="text-white font-bold">KR</span>
                                <span className="text-blue-200">·</span>
                                <span className="text-white font-bold">AI</span>
                            </span>
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
                                aria-label="Tutup chat"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {!hasConfig ? (
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col items-center justify-center text-center">
                                <Bot className="w-10 h-10 text-blue-300 mb-2" />
                                <p className="text-sm font-medium text-gray-700">AI belum dikonfigurasi.</p>
                                <Link
                                    href="/pengaturan"
                                    className="mt-2 inline-block text-xs text-blue-600 hover:underline font-medium"
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

            {/* Floating button */}
            <button
                onClick={() => { dismissHint(); setIsOpen(v => !v); }}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-[52px] h-[52px] bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-40"
                title="KR·AI - AI Assistant"
                aria-label="Buka KR·AI chat"
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
            showTopBar
        />
    );
}
