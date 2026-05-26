'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Minimize2, ChevronRight, ChevronDown, Settings, LayoutGrid, Brain, Menu, X } from 'lucide-react';
import Link from 'next/link';
import AIChatCore, { type ChatMessage } from './AIChatCore';
import AIChatHistorySidebar from './AIChatHistorySidebar';
import { TEMPLATE_GROUPS, COLOR_MAP } from './chatTemplates';
import { loadMemory } from '@/lib/ai/memory';
import {
    listConversations,
    getConversation,
    createConversation,
    updateConversationMessages,
    setActiveConversation,
    getActiveId,
    type Conversation,
} from '@/lib/ai/history';

export default function AIChatFullscreen() {
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [memoryCount, setMemoryCount] = useState(0);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    // Sidebar visibility
    const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
    const [templatesOpen, setTemplatesOpen] = useState(false); // templates section
    const [activeGroup, setActiveGroup] = useState<string | null>(null);

    // Init: load active conversation or create one if needed
    useEffect(() => {
        const list = listConversations();
        let activeId = getActiveId();

        if (!activeId || !list.find(c => c.id === activeId)) {
            // No active or stale id — pick most recent or create new
            if (list.length > 0) {
                activeId = list[0].id;
                setActiveConversation(activeId);
            }
        }

        if (activeId) {
            const conv = getConversation(activeId);
            if (conv) {
                setActiveConv(conv);
                setMessages(conv.messages);
            }
        }
        setMemoryCount(loadMemory().length);
        setHistoryLoaded(true);
    }, []);

    const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
        setMessages(msgs);
        // Persist to active conversation, creating one if needed
        if (msgs.length === 0) return;
        let convId = activeConv?.id;
        if (!convId) {
            const newConv = createConversation();
            setActiveConv(newConv);
            convId = newConv.id;
        }
        updateConversationMessages(convId, msgs);
    }, [activeConv]);

    const handleSelectConversation = (id: string) => {
        const conv = getConversation(id);
        if (conv) {
            setActiveConv(conv);
            setMessages(conv.messages);
            setActiveConversation(id);
            setSidebarOpen(false); // close mobile drawer
        }
    };

    const handleNewConversation = () => {
        const conv = createConversation();
        setActiveConv(conv);
        setMessages([]);
        setActiveConversation(conv.id);
        setSidebarOpen(false);
    };

    const handleTemplateClick = (question: string) => {
        // Inject into the chat core (fills input, doesn't send)
        window.dispatchEvent(new CustomEvent('ai-chat-send', { detail: question }));
        setSidebarOpen(false);
    };

    const sidebarContent = (
        <div className="h-full flex flex-col">
            {/* Templates section — collapsible */}
            <div className="border-b border-gray-200">
                <button
                    onClick={() => setTemplatesOpen(v => !v)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                    <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide flex-1">
                        Template Pertanyaan
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${templatesOpen ? 'rotate-180' : ''}`} />
                </button>

                {templatesOpen && (
                    <div className="max-h-72 overflow-y-auto px-2 pb-2 space-y-0.5">
                        {TEMPLATE_GROUPS.map(group => {
                            const colors = COLOR_MAP[group.color];
                            const isOpen = activeGroup === group.id;
                            return (
                                <div key={group.id}>
                                    <button
                                        onClick={() => setActiveGroup(isOpen ? null : group.id)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left hover:bg-white transition-colors"
                                    >
                                        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                            <span>{group.emoji}</span>
                                            <span>{group.label}</span>
                                        </span>
                                        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
                )}
            </div>

            {/* Chat history — fills remaining space */}
            <div className="flex-1 min-h-0">
                <AIChatHistorySidebar
                    activeId={activeConv?.id ?? null}
                    onSelect={handleSelectConversation}
                    onNew={handleNewConversation}
                />
            </div>

            {/* Footer */}
            <div className="px-2 py-2 border-t border-gray-200">
                <Link
                    href="/pengaturan"
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                    <Settings className="w-3 h-3" />
                    Pengaturan AI
                </Link>
            </div>
        </div>
    );

    return (
        <div className="flex h-full overflow-hidden bg-white">
            {/* ── Sidebar — desktop fixed, mobile drawer ───────────────── */}
            {/* Desktop sidebar */}
            <aside className="hidden md:flex flex-shrink-0 w-64 border-r border-gray-200 bg-gray-50/80 flex-col">
                {sidebarContent}
            </aside>

            {/* Mobile drawer */}
            <div
                className={`md:hidden fixed inset-0 z-50 transition-opacity ${sidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
            >
                <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
                <aside
                    className={`absolute inset-y-0 left-0 w-72 bg-white border-r border-gray-200 shadow-xl transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
                        <span className="text-sm font-semibold text-gray-800">Krai</span>
                        <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                            <X className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>
                    <div className="h-[calc(100%-40px)]">
                        {sidebarContent}
                    </div>
                </aside>
            </div>

            {/* ── Main chat area ───────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Top bar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                            aria-label="Toggle sidebar"
                        >
                            <Menu className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                                    {activeConv?.title || 'Krai'}
                                </p>
                                <p className="text-[10px] text-gray-400 leading-tight truncate hidden sm:block">
                                    Kakarama AI Assistant
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                        {memoryCount > 0 && (
                            <span className="hidden sm:inline-flex text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 items-center gap-0.5">
                                <Brain className="w-2.5 h-2.5" />
                                {memoryCount}
                            </span>
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

                {/* Welcome state */}
                {historyLoaded && messages.length === 0 && (
                    <div className="overflow-y-auto flex-shrink-0">
                        <div className="max-w-3xl mx-auto px-4 pt-6 pb-3">
                            <div className="text-center mb-5">
                                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Bot className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-lg font-bold text-gray-900">Halo, saya Krai!</h2>
                                <p className="text-xs text-gray-500 mt-0.5 max-w-md mx-auto">
                                    Asisten AI analitik Kakarama Room. Tanyakan apa saja tentang data bisnis.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {TEMPLATE_GROUPS.slice(0, 6).map(group => {
                                    const colors = COLOR_MAP[group.color];
                                    return (
                                        <div key={group.id} className={`rounded-xl border ${colors.border} p-2.5`}>
                                            <p className={`text-xs font-semibold ${colors.text} mb-1`}>
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
                        </div>
                    </div>
                )}

                {/* Chat core */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {historyLoaded && (
                        <AIChatCoreWithDispatch
                            key={activeConv?.id ?? 'new'}
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
            showTopBar
        />
    );
}
