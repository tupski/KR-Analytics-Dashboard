'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Minimize2, ChevronRight, ChevronDown, Settings, LayoutGrid, Brain, Menu, X, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AIChatCore, { type ChatMessage } from './AIChatCore';
import AIChatHistorySidebar from './AIChatHistorySidebar';
import { TEMPLATE_GROUPS, COLOR_MAP } from './chatTemplates';
import { loadMemory } from '@/lib/ai/memory';
import KraiLogo from '@/components/shared/KraiLogo';
import {
    getConversation,
    getConversationWithMessages,
    createConversation,
    updateConversationMessages,
    setActiveConversation,
    syncFromRemote,
    type Conversation,
} from '@/lib/ai/history';

interface Props {
    /** Conversation ID from URL param */
    conversationId?: string;
    /** If true, create a fresh conversation with this id */
    forceNew?: boolean;
}

// First 2 categories: full cards with questions
// Remaining: name-only chips linking to sidebar templates
const WELCOME_FULL_CATEGORIES = TEMPLATE_GROUPS.slice(0, 2);
const WELCOME_CHIP_CATEGORIES = TEMPLATE_GROUPS.slice(2);

export default function AIChatFullscreen({ conversationId, forceNew }: Props) {
    const router = useRouter();
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputDraft, setInputDraft] = useState('');
    const [memoryCount, setMemoryCount] = useState(0);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);

    // Sidebar
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);

    // ── Init: load or create conversation ────────────────────────────────────
    useEffect(() => {
        setMemoryCount(loadMemory().length);

        // Sync remote history in background on first load
        syncFromRemote().catch(() => { });

        // Check if we're coming from float mode with an open conversation
        let floatConvId: string | null = null;
        let floatDraft = '';
        try {
            floatConvId = localStorage.getItem('krai:openConversationId');
            floatDraft = localStorage.getItem('krai:openConversationDraft') || '';
            // Clear markers after reading
            if (floatConvId) {
                localStorage.removeItem('krai:openConversationId');
                localStorage.removeItem('krai:openConversationDraft');
            }
        } catch { /* noop */ }

        // Determine which conversation id to use: URL param, float storage, or new
        const targetId = conversationId || floatConvId;
        if (!targetId) {
            setHistoryLoaded(true);
            return;
        }

        try {
            if (forceNew) {
                const existing = getConversation(targetId);
                if (existing) {
                    setActiveConv(existing);
                    setMessages(existing.messages || []);
                    // If conversation already has messages, remove ?new=1
                    if (existing.messages && existing.messages.length > 0) {
                        router.replace(`/chat/${targetId}`, { scroll: false });
                    }
                } else {
                    const newConv = createConversation(targetId);
                    setActiveConv(newConv);
                    setMessages([]);
                }
                setActiveConversation(targetId);
                setHistoryLoaded(true);
            } else {
                // Try local first, then fetch from Supabase if needed
                const local = getConversation(targetId);
                if (local && local.messages && local.messages.length > 0) {
                    setActiveConv(local);
                    setMessages(local.messages);
                    setActiveConversation(targetId);
                    setHistoryLoaded(true);
                } else {
                    // May need to load messages from Supabase
                    const newConv = local || createConversation(targetId);
                    setActiveConv(newConv);
                    setMessages([]);
                    setActiveConversation(targetId);
                    // Defer historyLoaded until async fetch completes
                    // — prevents welcome screen flash before messages arrive
                    getConversationWithMessages(targetId)
                        .then(full => {
                            if (full && full.messages && full.messages.length > 0) {
                                setActiveConv(full);
                                setMessages(full.messages);
                            }
                            setHistoryLoaded(true);
                            console.debug('[KRAI Chat History Load]', {
                                routeConversationId: conversationId,
                                selectedConversationId: full?.id ?? targetId,
                                messageCount: full?.messages?.length ?? 0,
                                isNew: false,
                                apiStatus: 'loaded',
                            });
                        })
                        .catch(err => {
                            console.error('[AIChatFullscreen] Failed to load conversation:', err);
                            setHistoryLoaded(true);
                        });
                }
            }

            // Restore draft from float mode
            if (floatDraft) {
                setInputDraft(floatDraft);
            }
        } catch (err) {
            console.error('[AIChatFullscreen] Init error:', err);
            setHistoryLoaded(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, forceNew]);

    // ── Message persistence ───────────────────────────────────────────────────
    const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
        setMessages(msgs);
        if (!msgs || msgs.length === 0) return;
        const convId = activeConv?.id;
        if (!convId) return;
        try {
            updateConversationMessages(convId, msgs);
        } catch (err) {
            console.error('[AIChatFullscreen] Failed to update messages:', err);
        }
        // Clean ?new=1 after first real message is sent
        if (msgs.length > 0) {
            router.replace(`/chat/${convId}`, { scroll: false });
        }
    }, [activeConv, router]);

    const handleInputChange = useCallback((val: string) => {
        setInputDraft(val);
    }, []);

    // ── Navigation to a conversation ─────────────────────────────────────────
    const handleSelectConversation = (id: string) => {
        router.push(`/chat/${id}`);
        setSidebarOpen(false);
    };

    const handleNewConversation = () => {
        const newId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        router.push(`/chat/${newId}?new=1`);
        setSidebarOpen(false);
    };

    // ── Templates ─────────────────────────────────────────────────────────────
    const handleTemplateClick = (question: string) => {
        if (isStreaming) return;
        window.dispatchEvent(new CustomEvent('ai-chat-send', { detail: question }));
        setSidebarOpen(false);
    };

    /** Open sidebar + expand all templates */
    const handleViewAllTemplates = () => {
        setSidebarOpen(true);
        setTemplatesOpen(true);
        // Expand all groups
        TEMPLATE_GROUPS.forEach(g => setActiveGroup(g.id));
    };

    // ── Sidebar content (used by both desktop sidebar and mobile drawer) ──────
    const sidebarContent = (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Templates section — collapsible */}
            <div className="border-b border-gray-200 flex-shrink-0">
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
                    <div className="max-h-64 overflow-y-auto px-2 pb-2 space-y-0.5">
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

            {/* Chat history — takes remaining space, scrolls internally */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <AIChatHistorySidebar
                    activeId={activeConv?.id ?? null}
                    onSelect={handleSelectConversation}
                    onNew={handleNewConversation}
                />
            </div>

            {/* Settings footer — always at bottom */}
            <div className="px-2 py-2 border-t border-gray-200 flex-shrink-0">
                <Link
                    href="/pengaturan"
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                    <Settings className="w-3 h-3" />
                    Pengaturan KR·AI
                </Link>
            </div>
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-1 min-h-0 overflow-hidden bg-white">
            {/* ── Desktop sidebar ── */}
            <aside
                className="hidden md:flex h-full min-h-0 flex-shrink-0 w-64 border-r border-gray-200 bg-gray-50/80 flex-col overflow-hidden"
            >
                {sidebarContent}
            </aside>

            {/* ── Mobile sidebar drawer ── */}
            <div
                className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${sidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
            >
                <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
                <aside
                    className={`absolute inset-y-0 left-0 w-[min(72vw,280px)] flex flex-col bg-white border-r border-gray-200 shadow-xl transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 flex-shrink-0">
                        <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                            <Bot className="w-4 h-4 text-blue-600" /> KR·AI
                        </span>
                        <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-gray-100 rounded" title="Tutup sidebar">
                            <X className="w-4 h-4 text-gray-600" />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {sidebarContent}
                    </div>
                </aside>
            </div>

            {/* ── Main area — full height flex column, children handle internal overflow ── */}
            <div className="flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden">
                {/* ── Top bar header ── */}
                <div
                    className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white/95 backdrop-blur-sm flex-shrink-0 z-30 sticky top-0"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        {/* Mobile: toggle sidebar */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
                            aria-label="Buka sidebar"
                        >
                            <Menu className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 leading-tight truncate">
                                    {activeConv?.title && activeConv.title !== 'Percakapan baru'
                                        ? activeConv.title
                                        : 'KR·AI'}
                                </p>
                                <p className="text-[10px] text-gray-400 leading-tight hidden sm:block">
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
                        {/* New chat button */}
                        <button
                            onClick={handleNewConversation}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Chat baru"
                            aria-label="Buat chat baru"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
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

                {/* ── Welcome state — only when no messages ── */}
                {historyLoaded && messages.length === 0 && (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="max-w-2xl mx-auto px-4 pt-6 pb-4">
                            {/* Branding */}
                            <div className="flex items-start gap-3 mb-6">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-400 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                                    <Bot className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-1.5 mb-1">
                                        Halo, saya <KraiLogo size="lg" />!
                                    </h1>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Saya adalah asisten AI Kakarama Room yang dilatih khusus membantu menganalisa data laporan bisnis Kakarama Room.
                                    </p>
                                </div>
                            </div>

                            {/* Template questions card */}
                            <div className="w-full rounded-xl border border-blue-100 bg-blue-50/30 p-3 mb-3">
                                <p className="text-xs font-semibold text-blue-700 mb-2">
                                    📊 Performa Harian
                                </p>
                                <div className="space-y-1.5">
                                    {TEMPLATE_GROUPS[0]?.questions.slice(0, 1).map((q, qi) => (
                                        <button
                                            key={qi}
                                            onClick={() => handleTemplateClick(q)}
                                            disabled={isStreaming}
                                            className="w-full text-left text-xs px-2.5 py-2 bg-white hover:bg-blue-50 rounded-lg text-blue-700 transition-colors flex items-start gap-1.5 leading-snug border border-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                            <span>{q}</span>
                                        </button>
                                    ))}
                                    <div className="hidden sm:block">
                                        {TEMPLATE_GROUPS[0]?.questions.slice(1, 2).map((q, qi) => (
                                            <button
                                                key={qi}
                                                onClick={() => handleTemplateClick(q)}
                                                disabled={isStreaming}
                                                className="w-full text-left text-xs px-2.5 py-2 bg-white hover:bg-blue-50 rounded-lg text-blue-700 transition-colors flex items-start gap-1.5 leading-snug border border-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                <span>{q}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="text-center">
                                <button
                                    onClick={handleViewAllTemplates}
                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline flex items-center gap-1 mx-auto"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                    Lihat semua template →
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Chat core — flex-1, min-h-0 for proper overflow containment ── */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {historyLoaded && (
                        <AIChatCoreWithDispatch
                            key={activeConv?.id ?? 'new'}
                            messages={messages}
                            initialInput={inputDraft}
                            onMessagesChange={handleMessagesChange}
                            onInputChange={handleInputChange}
                            onLoadingChange={setIsStreaming}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function AIChatCoreWithDispatch({
    messages,
    initialInput,
    onMessagesChange,
    onInputChange,
    onLoadingChange,
}: {
    messages: ChatMessage[];
    initialInput?: string;
    onMessagesChange: (msgs: ChatMessage[]) => void;
    onInputChange?: (val: string) => void;
    onLoadingChange?: (loading: boolean) => void;
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
            initialInput={initialInput || ''}
            onMessagesChange={onMessagesChange}
            onInputChange={onInputChange}
            onSendRef={sendRef}
            showMemoryButton
            showTopBar
            onLoadingChange={onLoadingChange}
        />
    );
}
