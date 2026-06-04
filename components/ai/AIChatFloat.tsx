'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X, Bot, Maximize2 } from 'lucide-react';
import AIChatCore, { type ChatMessage } from './AIChatCore';
import { hasConfiguredProviders } from '@/lib/ai/configClient';
import KraiLogo from '@/components/shared/KraiLogo';
import { normalizeAiText } from '@/lib/ai/normalizeAiText';
import { createConversation, updateConversationMessages } from '@/lib/ai/history';

const GREETING_DISMISSED_KEY = 'kr_ai_greeting_dismissed';
const FLOAT_CONV_KEY = 'krai:floatConversationId';
const FLOAT_MESSAGES_KEY = 'krai:floatMessages';
const FLOAT_DRAFT_KEY = 'krai:floatDraft';

export default function AIChatFloat() {
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputDraft, setInputDraft] = useState('');
    const [hasConfig, setHasConfig] = useState(false);
    const [showGreeting, setShowGreeting] = useState(false);
    const [convId, setConvId] = useState<string | null>(null);

    // All hooks must be called unconditionally — compute flags after hooks
    const isOnAiPage = pathname?.startsWith('/chat') || pathname?.startsWith('/analytics-ai');

    useEffect(() => {
        async function checkConfig() {
            try {
                const configured = await hasConfiguredProviders();
                setHasConfig(configured);
            } catch {
                setHasConfig(false);
            }
        }
        checkConfig();

        // Restore conversation from storage
        try {
            const storedId = localStorage.getItem(FLOAT_CONV_KEY);
            if (storedId) setConvId(storedId);

            const storedMsgs = localStorage.getItem(FLOAT_MESSAGES_KEY);
            if (storedMsgs) {
                const parsed = JSON.parse(storedMsgs) as ChatMessage[];
                setMessages(parsed);
            }

            const storedDraft = localStorage.getItem(FLOAT_DRAFT_KEY);
            if (storedDraft) setInputDraft(storedDraft);
        } catch { /* noop */ }

        // Greeting: once per session
        try {
            const dismissed = sessionStorage.getItem(GREETING_DISMISSED_KEY);
            if (dismissed !== 'true') {
                const timer = setTimeout(() => setShowGreeting(true), 1500);
                return () => clearTimeout(timer);
            }
        } catch { }
    }, []);

    // Persist messages to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(FLOAT_MESSAGES_KEY, JSON.stringify(messages));
        } catch { /* quota */ }
    }, [messages]);

    // Persist draft to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(FLOAT_DRAFT_KEY, inputDraft);
        } catch { /* quota */ }
    }, [inputDraft]);

    const dismissGreeting = () => {
        setShowGreeting(false);
        try { sessionStorage.setItem(GREETING_DISMISSED_KEY, 'true'); } catch { }
    };

    const handleOpenChat = () => {
        dismissGreeting();
        setIsOpen(true);
    };

    // Expand to full page — continue same conversation
    const handleExpand = useCallback(() => {
        const id = convId || globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);

        // Ensure conversation exists in history with messages
        try {
            if (messages.length > 0) {
                createConversation(id);
                updateConversationMessages(id, messages);
            }
        } catch { /* noop */ }

        // Store current conversation id + draft so AIChatFullscreen picks it up
        try {
            localStorage.setItem('krai:openConversationId', id);
            localStorage.setItem('krai:openConversationDraft', inputDraft);
        } catch { /* noop */ }

        setIsOpen(false);
        router.push(`/chat/${id}`);
    }, [convId, messages, inputDraft, router]);

    // Messages change handler
    const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
        const sanitized = msgs.map(m => {
            if (m.role === 'assistant' && m.content) {
                const normalized = normalizeAiText(m.content);
                if (normalized !== m.content) return { ...m, content: normalized };
            }
            return m;
        });
        setMessages(sanitized);

        // Generate conversation id on first user message
        if (sanitized.length > 0 && !convId) {
            const newId = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
            setConvId(newId);
            try { localStorage.setItem(FLOAT_CONV_KEY, newId); } catch { /* quota */ }
        }
    }, [convId]);

    const handleInputChange = useCallback((val: string) => {
        setInputDraft(val);
    }, []);

    // Intercept follow-up clicks from insight cards
    useExternalPromptHandler(isOpen, setIsOpen);

    // If on AI chat page, render nothing — hooks already called above
    if (isOnAiPage) return null;

    return (
        <>
            {/* Greeting popup */}
            {showGreeting && !isOpen && (
                <div className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-40 max-w-[260px] animate-fade-in">
                    <div className="relative bg-white rounded-2xl rounded-br-sm shadow-xl border border-blue-200 p-3 pr-8">
                        <button
                            onClick={dismissGreeting}
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
                            <button
                                onClick={handleExpand}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                title="Buka fullscreen"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>
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
                                <button
                                    onClick={() => { setIsOpen(false); router.push('/pengaturan'); }}
                                    className="mt-2 inline-block text-xs text-blue-600 hover:underline font-medium"
                                >
                                    Setup API key di Pengaturan →
                                </button>
                            </div>
                        ) : (
                            <AIChatCore
                                mode="float"
                                initialMessages={messages}
                                initialInput={inputDraft}
                                onMessagesChange={handleMessagesChange}
                                onInputChange={handleInputChange}
                                showTopBar
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Floating button */}
            <button
                onClick={() => { dismissGreeting(); setIsOpen(v => !v); }}
                className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-[52px] h-[52px] bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 flex items-center justify-center z-40"
                title="KR·AI - AI Assistant"
                aria-label="Buka KR·AI chat"
            >
                {isOpen ? <X className="w-5 h-5" /> : <Bot className="w-6 h-6" />}
            </button>
        </>
    );
}

/**
 * Hook to intercept follow-up clicks from insight cards.
 * Opens chat if closed and re-dispatches the question so AIChatCore picks it up.
 */
function useExternalPromptHandler(isOpen: boolean, setIsOpen: (v: boolean) => void) {
    useEffect(() => {
        const handler = (e: Event) => {
            const q = (e as CustomEvent<string>).detail;
            if (!q?.trim()) return;
            if (!isOpen) {
                setIsOpen(true);
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('ai-chat-prompt-send', { detail: q }));
                }, 150);
            }
        };
        window.addEventListener('ai-chat-prompt-send', handler);
        return () => window.removeEventListener('ai-chat-prompt-send', handler);
    }, [isOpen, setIsOpen]);
}
