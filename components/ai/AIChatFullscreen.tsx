'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Minimize2, Trash2, ChevronRight, ChevronDown, Settings, LayoutGrid, Brain } from 'lucide-react';
import Link from 'next/link';
import AIChatCore, { type ChatMessage } from './AIChatCore';
import { TEMPLATE_GROUPS, COLOR_MAP } from './chatTemplates';
import { clearMemory, loadMemory } from '@/lib/ai/memory';

const STORAGE_KEY = 'kr-ai-chat-history';
const HISTORY_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadHistory(): ChatMessage[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const { messages, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp > HISTORY_TTL) return [];
        return messages || [];
    } catch {
        return [];
    }
}

function saveHistory(messages: ChatMessage[]) {
    try {
        const toSave = messages.map(m => ({ ...m, typed: true, suggestions: m.suggestions }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: toSave, timestamp: Date.now() }));
    } catch { }
}

export default function AIChatFullscreen() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    // Collapsed by default
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [memoryCount, setMemoryCount] = useState(0);

    useEffect(() => {
        const saved = loadHistory();
        setMessages(saved);
        setHistoryLoaded(true);
        setMemoryCount(loadMemory().length);
    }, []);

    const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
        setMessages(msgs);
        saveHistory(msgs);
    }, []);

    const handleClear = () => {
        setMessages([]);
        localStorage.removeItem(STORAGE_KEY);
    };

    const handleTemplateClick = (question: string) => {
        window.dispatchEvent(new CustomEvent('ai-chat-send', { detail: question }));
        if (window.innerWidth < 1024) setSidebarOpen(false);
    };

    return (
        <div className="flex h-full overflow-hidden bg-white">
            {/* ── Template Sidebar — collapsed by default ────────── */}
            <aside
                className={`flex-shrink-0 border-r border-gray-100 bg-gray-50/80 flex flex-col transition-all duration-200 overflow-hidden ${sidebarOpen ? 'w-64' : 'w-0'}`}
            >
                {sidebarOpen && (
                    <>
                        <div className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2">
                            <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-gray-700">Template Pertanyaan</span>
                        </div>

                        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                            {TEMPLATE_GROUPS.map(group => {
                                const colors = COLOR_MAP[group.color];
                                const isOpen = activeGroup === group.id;
                                return (
                                    <div key={group.id}>
                                        <button
                                            onClick={() => setActiveGroup(isOpen ? null : group.id)}
                                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left hover:bg-white transition-colors"
                                        >
                                            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                                <span>{group.emoji}</span>
                                                <span>{group.label}</span>
                                            </span>
                                            <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {isOpen && (
                                            <div className={`ml-2 mt-0.5 mb-1 space-y-0.5 pl-2 border-l-2 ${colors.border}`}>
                                                {group.questions.map((q, qi) => (
                                                    <button
                                                        key={qi}
                                                        onClick={() => handleTemplateClick(q)}
                                                        className={`w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg ${colors.bg} ${colors.text} ${colors.hover} transition-colors leading-snug`}
                                                    >
                                                        {q}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="px-2 py-2 border-t border-gray-200">
                            <Link
                                href="/pengaturan"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-gray-500 hover:bg-white rounded-lg transition-colors"
                            >
                                <Settings className="w-3 h-3" />
                                Pengaturan AI
                            </Link>
                        </div>
                    </>
                )}
            </aside>

            {/* ── Main chat area ──────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top bar — compact */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {/* Template sidebar toggle */}
                        <button
                            onClick={() => setSidebarOpen(v => !v)}
                            className={`p-1.5 rounded-lg transition-colors text-xs ${sidebarOpen ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                            title="Template pertanyaan"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>

                        {/* Krai branding */}
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-sm font-bold text-gray-900 leading-tight">Krai</p>
                                <p className="text-[10px] text-gray-400 leading-tight">Kakarama AI Assistant</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        {memoryCount > 0 && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">
                                <Brain className="w-2.5 h-2.5 inline mr-0.5" />
                                {memoryCount} memori
                            </span>
                        )}
                        {messages.length > 0 && (
                            <button
                                onClick={handleClear}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Hapus riwayat"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Kembali ke dashboard"
                        >
                            <Minimize2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Minimize</span>
                        </Link>
                    </div>
                </div>

                {/* Welcome grid — shown only when no messages */}
                {historyLoaded && messages.length === 0 && (
                    <div className="overflow-y-auto flex-shrink-0">
                        <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
                            <div className="text-center mb-6">
                                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Bot className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-lg font-bold text-gray-900">Halo, saya Krai!</h2>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    Asisten AI analitik Kakarama Room. Tanyakan apa saja.
                                </p>
                            </div>

                            {/* 3 × 2 quick template grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {TEMPLATE_GROUPS.slice(0, 6).map(group => {
                                    const colors = COLOR_MAP[group.color];
                                    return (
                                        <div key={group.id} className={`rounded-xl border ${colors.border} p-3`}>
                                            <p className={`text-xs font-semibold ${colors.text} mb-1.5`}>
                                                {group.emoji} {group.label}
                                            </p>
                                            <div className="space-y-1">
                                                {group.questions.slice(0, 2).map((q, qi) => (
                                                    <button
                                                        key={qi}
                                                        onClick={() => handleTemplateClick(q)}
                                                        className={`w-full text-left text-[11px] px-2 py-1.5 ${colors.bg} ${colors.hover} rounded-lg ${colors.text} transition-colors flex items-start gap-1 leading-snug`}
                                                    >
                                                        <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                        <span>{q}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-center text-[11px] text-gray-400 mt-3">
                                Atau buka <button onClick={() => setSidebarOpen(true)} className="text-blue-500 hover:underline">template lengkap</button> di sidebar kiri.
                            </p>
                        </div>
                    </div>
                )}

                {/* Chat core — fills remaining space */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {historyLoaded && (
                        <AIChatCoreWithDispatch
                            messages={messages}
                            onMessagesChange={handleMessagesChange}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function AIChatCoreWithDispatch({
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
        window.addEventListener('ai-chat-send', handler);
        return () => window.removeEventListener('ai-chat-send', handler);
    }, []);

    return (
        <AIChatCore
            mode="full"
            initialMessages={messages}
            onMessagesChange={onMessagesChange}
            onSendRef={sendRef}
            showMemoryButton
        />
    );
}
