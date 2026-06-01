'use client';

/**
 * AIChatCore — shared chat engine for both AIChatFloat and the full-screen KR·AI page.
 *
 * Features:
 * - Multi-provider config + Auto model selection
 * - Thinking modes: Auto | Instant | Thinking
 * - Image paste (vision-capable models only)
 * - Copy button + timestamp + model badge per assistant message
 * - Animated typewriter loading states
 * - Dynamic follow-up suggestions
 * - Italic foreign word emphasis (handled in MarkdownRenderer)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, Brain, X, ChevronRight, Copy, Check, AlertTriangle, Eye, Lightbulb, Wrench, Zap, ChevronDown, RotateCw, Pencil } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ChatModelSelector from './ChatModelSelector';
import { loadMemory, addMemory, deleteMemory, getMemoryContext, extractMemoryFromConversation, type MemoryEntry } from '@/lib/ai/memory';
import KraiLogo from '@/components/shared/KraiLogo';
import {
    loadConfig,
    setActive,
    setThinkingMode as persistThinkingMode,
    type ThinkingMode,
    type MultiAIConfig,
} from '@/lib/ai/config';
import {
    loadConfigFromDb,
    setActiveProviderInDb,
    setThinkingModeInDb,
    type MultiAIConfig as DbMultiAIConfig,
} from '@/lib/ai/configClient';
import { PROVIDERS, getModel, type ProviderId } from '@/lib/ai/models';
import { getModels } from '@/lib/ai/modelClient';
import type { ProviderModel } from '@/types/ai-models';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    typed?: boolean;
    suggestions?: string[];
    /** ISO timestamp when message was created */
    timestamp?: number;
    /** Model used to generate this message (assistant only) */
    model?: string;
    provider?: string;
    /** Optional image data URL (user message only) */
    imageDataUrl?: string;
    /** Token usage information (assistant only) */
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// ── Loading indicator — pure CSS dots, zero JS state ────────────────────────

function LoadingBubble({ thinking }: { thinking?: boolean }) {
    return (
        <div className="flex justify-start items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm shadow-sm px-3 py-2.5 flex items-center gap-2">
                {/* 3 dot pulse — pure CSS, no JS re-render */}
                <span className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
                </span>
                {thinking && (
                    <span className="text-xs text-gray-400 italic">Berpikir...</span>
                )}
            </div>
        </div>
    );
}

// No typing loop, no rAF, no setInterval.
// Response appears instantly with a subtle fade-in — same as Claude/Gemini.

function AssistantMessage({ content }: { content: string }) {
    return (
        <div className="animate-fade-in">
            <MarkdownRenderer content={content} />
        </div>
    );
}

// ── API ──────────────────────────────────────────────────────────────────────

async function sendChat(
    apiMessages: { role: string; content: string }[],
    memoryContext: string,
    thinkingMode: ThinkingMode,
    needVision: boolean,
    activeProvider: ProviderId | 'auto',
    activeModel: string,
): Promise<{ message: string; model?: string; provider?: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    // API keys are loaded server-side from DB — client never sends full keys
    const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: apiMessages,
            config: {
                provider: activeProvider,
                model: activeModel,
            },
            thinkingMode,
            memoryContext,
        }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
}

async function fetchFollowUpSuggestions(
    userQuestion: string,
    aiAnswer: string,
    activeProvider: ProviderId | 'auto',
    activeModel: string,
): Promise<string[]> {
    try {
        const prompt = `Kamu adalah KR·AI. Berdasarkan konteks berikut, hasilkan TEPAT 2 pertanyaan lanjutan yang spesifik dan relevan untuk membantu owner mendapat insight bisnis. Kembalikan HANYA 2 baris teks tanpa nomor/bullet.

Pertanyaan: ${userQuestion.slice(0, 200)}
Jawaban: ${aiAnswer.slice(0, 400)}

2 pertanyaan:`;

        const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                config: {
                    provider: activeProvider,
                    model: activeModel,
                },
                memoryContext: '',
            }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.message as string)
            .split('\n')
            .map((l: string) => l.trim().replace(/^[-•\d.)\s]+/, '').trim())
            .filter((l: string) => l.length > 5)
            .slice(0, 2);
    } catch {
        return [];
    }
}

// ── Memory panel ─────────────────────────────────────────────────────────────

function MemoryPanel({ onClose }: { onClose: () => void }) {
    const [entries, setEntries] = useState<MemoryEntry[]>([]);
    const [draft, setDraft] = useState('');

    useEffect(() => { setEntries(loadMemory()); }, []);

    const handleAdd = () => {
        if (!draft.trim()) return;
        const e = addMemory(draft);
        setEntries(prev => [...prev, e]);
        setDraft('');
    };
    const handleDelete = (id: string) => {
        deleteMemory(id);
        setEntries(prev => prev.filter(e => e.id !== id));
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-blue-600" />
                        <h2 className="font-semibold text-gray-900 text-sm">Memori <KraiLogo size="sm" /></h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {entries.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-6">
                            Belum ada memori. Tambahkan fakta atau konteks yang ingin KR·AI ingat.
                        </p>
                    )}
                    {entries.map(e => (
                        <div key={e.id} className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                            <p className="flex-1 text-xs text-gray-700 leading-relaxed">{e.text}</p>
                            <button onClick={() => handleDelete(e.id)} className="flex-shrink-0 p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 transition-colors">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="px-4 pb-4 border-t border-gray-200 pt-3">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                            placeholder="Contoh: Fokus analisis ke lokasi Bintaro"
                            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button onClick={handleAdd} disabled={!draft.trim()} className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            Simpan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Capability mini-badges (used in model picker) ─────────────────────────────

function CapBadges({ caps }: { caps: { vision?: boolean; reasoning?: boolean; tools?: boolean; fast?: boolean } }) {
    return (
        <span className="inline-flex gap-0.5 flex-shrink-0">
            {caps.vision && <span title="Vision" className="text-purple-500"><Eye className="w-3 h-3" /></span>}
            {caps.reasoning && <span title="Reasoning" className="text-amber-500"><Lightbulb className="w-3 h-3" /></span>}
            {caps.tools && <span title="Tools" className="text-blue-500"><Wrench className="w-3 h-3" /></span>}
            {caps.fast && <span title="Fast" className="text-emerald-500"><Zap className="w-3 h-3" /></span>}
        </span>
    );
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// ── Main component ────────────────────────────────────────────────────────────

export interface AIChatCoreProps {
    mode: 'float' | 'full';
    initialMessages?: ChatMessage[];
    onMessagesChange?: (msgs: ChatMessage[]) => void;
    onSendRef?: React.MutableRefObject<((q: string) => void) | null>;
    showMemoryButton?: boolean;
    /** Show top toolbar with model selector + thinking mode (always shown in 'full', optional in 'float') */
    showTopBar?: boolean;
}

export default function AIChatCore({
    mode,
    initialMessages = [],
    onMessagesChange,
    onSendRef,
    showMemoryButton = false,
    showTopBar = true,
}: AIChatCoreProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [input, setInput] = useState('');
    const [pendingImage, setPendingImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showMemory, setShowMemory] = useState(false);
    const [config, setConfig] = useState<MultiAIConfig | null>(null);
    const [thinkingMode, setThinkingModeState] = useState<ThinkingMode>('auto');
    const [showModelPicker, setShowModelPicker] = useState(false);       // Toolbar model selector
    const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [retryingIdx, setRetryingIdx] = useState<number | null>(null);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const onMessagesChangeRef = useRef(onMessagesChange);
    onMessagesChangeRef.current = onMessagesChange;

    // Sync messages with external store (e.g., conversation switch via key prop in parent)
    // The parent (AIChatFullscreen) uses `key={activeConv?.id}` to remount on switch,
    // so initialMessages will be fresh on every switch.

    // Load config from database + listen for changes
    useEffect(() => {
        const refresh = async () => {
            try {
                // Try loading from database first
                const dbConfig = await loadConfigFromDb();
                if (dbConfig.providers.length > 0) {
                    // Convert DB config to local config format (no full keys in client)
                    // apiKeySet is used instead of actual key — chat route loads keys server-side
                    const localConfig: MultiAIConfig = {
                        activeProvider: dbConfig.activeProvider,
                        activeModel: dbConfig.activeModel,
                        providers: Object.fromEntries(
                            dbConfig.providers.filter(p => p.apiKeySet).map(p => [
                                p.providerId,
                                {
                                    apiKey: '', // Never available client-side
                                    model: p.model,
                                    baseUrl: p.baseUrl || '',
                                }
                            ])
                        ),
                        thinkingMode: dbConfig.thinkingMode,
                    };
                    setConfig(localConfig);
                    setThinkingModeState(dbConfig.thinkingMode);
                    return;
                }
            } catch (err) {
                console.warn('Failed to load config from DB, falling back to localStorage:', err);
            }

            // Fallback to localStorage
            const c = loadConfig();
            setConfig(c);
            setThinkingModeState(c.thinkingMode);
        };
        refresh();
        window.addEventListener('kr-ai-config-changed', refresh);
        return () => window.removeEventListener('kr-ai-config-changed', refresh);
    }, []);

    // Load models from all configured providers
    useEffect(() => {
        const loadAllModels = async () => {
            setLoadingModels(true);
            try {
                // Load from DB first
                try {
                    const dbConfig = await loadConfigFromDb();
                    const providers = dbConfig.providers.length > 0
                        ? dbConfig.providers.map(p => p.providerId)
                        : ['openai-compatible', 'openai', 'google', 'anthropic', 'deepseek'];

                    const allModels: ProviderModel[] = [];

                    for (const provider of providers) {
                        try {
                            const response = await getModels(provider);
                            allModels.push(...(response.models || []));
                        } catch {
                            // Skip provider if error
                        }
                    }

                    setAvailableModels(allModels);
                } catch {
                    // If DB fails, try localStorage config
                    const c = loadConfig();
                    const configuredIds = Object.keys(c.providers);
                    const allModels: ProviderModel[] = [];

                    for (const provider of configuredIds) {
                        try {
                            const response = await getModels(provider);
                            allModels.push(...(response.models || []));
                        } catch {
                            // Skip provider if error
                        }
                    }

                    setAvailableModels(allModels);
                }
            } finally {
                setLoadingModels(false);
            }
        };

        loadAllModels();
    }, []);

    // Reload models when config changes
    useEffect(() => {
        if (!config) return;
        const loadConfiguredModels = async () => {
            setLoadingModels(true);
            try {
                const configuredIds = Object.keys(config.providers);
                const allModels: ProviderModel[] = [];

                for (const provider of configuredIds) {
                    try {
                        const response = await getModels(provider);
                        allModels.push(...(response.models || []));
                    } catch {
                        // Skip provider if error
                    }
                }

                setAvailableModels(allModels);
            } finally {
                setLoadingModels(false);
            }
        };

        loadConfiguredModels();
    }, [config]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        onMessagesChangeRef.current?.(messages);
    }, [messages]);

    const markLastTyped = useCallback(() => {
        // No-op: typing animation removed (Opsi A — direct render)
    }, []);

    // ── Derive active provider/model from config ──────────────────────────────
    const activeProviderId: ProviderId | 'auto' = config?.activeProvider ?? 'auto';
    const activeModelId = config?.activeModel ?? 'auto';

    // ── Determine if active model supports vision ─────────────────────────────
    const visionCapable: boolean = (() => {
        if (!config) return false;
        if (activeProviderId === 'auto' || activeModelId === 'auto') {
            return Object.entries(config.providers).some(([pid, c]) => {
                if (!c) return false;
                const provider = PROVIDERS.find(p => p.id === pid);
                return provider?.models.some(m => m.capabilities.vision);
            });
        }
        const m = getModel(activeProviderId as ProviderId, activeModelId);
        return m?.capabilities.vision ?? false;
    })();

    const addSuggestions = useCallback((userQ: string, aiAnswer: string) => {
        fetchFollowUpSuggestions(userQ, aiAnswer, activeProviderId, activeModelId).then(suggestions => {
            if (suggestions.length === 0) return;
            setMessages(prev => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].role === 'assistant') {
                        updated[i] = { ...updated[i], suggestions };
                        break;
                    }
                }
                return updated;
            });
        });
    }, [activeProviderId, activeModelId]);

    const handleSend = useCallback(async (text?: string) => {
        const msg = (text || input).trim();
        if (!msg && !pendingImage) return;
        if (loading) return;

        // Image without vision support → warn
        if (pendingImage && !visionCapable) {
            setError('Model aktif tidak mendukung gambar. Pilih model dengan kemampuan vision (Gemini, GPT-4o, Claude, dll).');
            return;
        }

        const userMessage: ChatMessage = {
            role: 'user',
            content: msg || '(gambar terlampir)',
            typed: true,
            timestamp: Date.now(),
            imageDataUrl: pendingImage || undefined,
        };
        const newMessages: ChatMessage[] = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setPendingImage(null);
        setError(null);
        setLoading(true);

        try {
            const memCtx = getMemoryContext();
            // For vision: send content as array; otherwise just text
            const apiMessages = newMessages.map(m => {
                if (m.role === 'user' && m.imageDataUrl && visionCapable) {
                    return {
                        role: m.role,
                        content: [
                            { type: 'text', text: m.content },
                            { type: 'image_url', image_url: { url: m.imageDataUrl } },
                        ] as any,
                    };
                }
                return { role: m.role, content: m.content };
            });

            const result = await sendChat(apiMessages, memCtx, thinkingMode, !!pendingImage, activeProviderId, activeModelId);
            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: result.message,
                typed: true,        // immediate — no typing animation
                timestamp: Date.now(),
                model: result.model,
                provider: result.provider,
                usage: result.usage,
            };
            setMessages([...newMessages, assistantMsg]);
            setTimeout(() => addSuggestions(msg, result.message), 300);

            // Auto-extract memory from this conversation (fire-and-forget, don't block UI)
            extractMemoryFromConversation(
                msg,
                result.message,
                async (msgs, mode) => sendChat(msgs, '', (mode as ThinkingMode) || 'instant', false, activeProviderId, activeModelId),
            ).catch(() => { /* silent */ });
        } catch (err: any) {
            setError(err.message || 'Gagal menghubungi KR·AI');
        } finally {
            setLoading(false);
        }
    }, [input, pendingImage, loading, messages, thinkingMode, visionCapable, addSuggestions, activeProviderId, activeModelId]);

    /** Fill input instead of sending — used by template/suggestion buttons */
    const handleFillInput = useCallback((text: string) => {
        setInput(text);
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                const len = text.length;
                if ('setSelectionRange' in inputRef.current) {
                    inputRef.current.setSelectionRange(len, len);
                }
            }
        }, 50);
    }, []);

    /** Listen for ai-chat-prompt-send events from insight cards — send directly */
    useEffect(() => {
        const handler = (e: Event) => {
            const q = (e as CustomEvent<string>).detail;
            if (q?.trim()) handleSend(q);
        };
        window.addEventListener('ai-chat-prompt-send', handler);
        return () => window.removeEventListener('ai-chat-prompt-send', handler);
    }, [handleSend]);

    useEffect(() => {
        if (onSendRef) onSendRef.current = (q: string) => handleFillInput(q);
    }, [handleFillInput, onSendRef]);

    // ── Image paste handler ───────────────────────────────────────────────────
    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!file) continue;
                e.preventDefault();
                const reader = new FileReader();
                reader.onload = ev => {
                    const dataUrl = ev.target?.result as string;
                    setPendingImage(dataUrl);
                    if (!visionCapable) {
                        setError('⚠️ Model aktif tidak mendukung gambar. Ganti ke model dengan kemampuan vision.');
                    }
                };
                reader.readAsDataURL(file);
                return;
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleCopy = (text: string, idx: number) => {
        navigator.clipboard.writeText(text).catch(() => { });
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 2000);
    };
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

    const handleThinkingChange = async (mode: ThinkingMode) => {
        setThinkingModeState(mode);
        try {
            // Try saving to database first
            if (config && config.activeProvider !== 'auto') {
                await setThinkingModeInDb(config.activeProvider as ProviderId, mode);
            }
        } catch (err) {
            // Fallback to localStorage
            persistThinkingMode(mode);
        }
    };

    const handleSelectModel = async (providerId: ProviderId | 'auto', modelId: string) => {
        try {
            // Try saving to database first
            if (providerId !== 'auto') {
                await setActiveProviderInDb(providerId, modelId);
            }
        } catch (err) {
            // Fallback to localStorage
            setActive(providerId, modelId);
        }
        setShowModelPicker(false);
        // Trigger config reload
        window.dispatchEvent(new Event('kr-ai-config-changed'));
    };

    /** Handler for ChatModelSelector — accepts modelId and optional provider */
    const handleChatModelChange = async (modelId: string, providerId?: string) => {
        const pid = (providerId as ProviderId) || activeProviderId;
        await handleSelectModel(pid || 'auto', modelId);
    };

    const isFloat = mode === 'float';
    const isFull = mode === 'full';

    // Active model display
    const activeModelLabel = (() => {
        if (!config) return 'Auto';
        if (activeProviderId === 'auto' || activeModelId === 'auto') return 'Auto';
        const m = getModel(activeProviderId as ProviderId, activeModelId);
        return m?.label || activeModelId;
    })();

    return (
        <div className="flex flex-col h-full">
            {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}

            {/* Message list */}
            <div className={`flex-1 overflow-y-auto ${isFloat ? 'p-3 space-y-3 bg-slate-50' : 'px-4 py-4 space-y-4 bg-slate-50/50'}`}>
                {/* Only show greeting in float mode - full mode has its own welcome screen */}
                {messages.length === 0 && !loading && isFloat && (
                    <div className="text-center py-6">
                        <div className="bg-gradient-to-br from-blue-600 to-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-3 w-10 h-10">
                            <Bot className="text-white w-5 h-5" />
                        </div>
                        <p className="font-semibold text-gray-800 text-sm">
                            Halo, saya <KraiLogo size="sm" />
                        </p>
                        <p className="mt-1 text-gray-500 text-xs">Asisten AI analitik Kakarama Room. Tanyakan apa saja tentang data bisnis.</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className="space-y-1.5 group">
                        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && (
                                <div className={`rounded-xl bg-blue-600 flex items-center justify-center mr-2 flex-shrink-0 mt-1 ${isFloat ? 'w-6 h-6' : 'w-7 h-7'}`}>
                                    <Bot className={`text-white ${isFloat ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                                </div>
                            )}
                            <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                {/* Image preview (user) */}
                                {msg.role === 'user' && msg.imageDataUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={msg.imageDataUrl} alt="lampiran" className="rounded-lg max-w-[200px] max-h-[200px] border border-gray-200" />
                                )}
                                <div
                                    className={`rounded-xl text-sm shadow-sm ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap px-3 py-2'
                                        : `bg-white text-gray-800 rounded-bl-sm border border-gray-200 ${isFloat ? 'px-3 py-2.5' : 'px-4 py-3'}`
                                        }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        <AssistantMessage content={msg.content} />
                                    ) : (
                                        <span>{msg.content}</span>
                                    )}
                                </div>

                                {/* Footer: token usage + timestamp + model + copy (assistant) */}
                                {msg.role === 'assistant' && msg.typed && (
                                    <div className="flex flex-col gap-1 px-1">
                                        {/* Token usage info - centered */}
                                        {msg.usage && (
                                            <div className="flex items-center justify-center gap-2 text-[9px] text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                                <span className="font-mono">
                                                    <span className="text-gray-500">In:</span> <span className="font-semibold text-gray-700">{msg.usage.prompt_tokens.toLocaleString()}</span>
                                                </span>
                                                <span className="text-gray-300">•</span>
                                                <span className="font-mono">
                                                    <span className="text-gray-500">Out:</span> <span className="font-semibold text-gray-700">{msg.usage.completion_tokens.toLocaleString()}</span>
                                                </span>
                                                <span className="text-gray-300">•</span>
                                                <span className="font-mono">
                                                    <span className="text-gray-500">Total:</span> <span className="font-semibold text-blue-600">{msg.usage.total_tokens.toLocaleString()}</span> <span className="text-gray-400">tokens</span>
                                                </span>
                                            </div>
                                        )}
                                        {/* Model name, timestamp, and copy button */}
                                        <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                                            <div className="flex items-center gap-2">
                                                {msg.timestamp && <span>{formatTimestamp(msg.timestamp)}</span>}
                                                {msg.model && (
                                                    <span className="inline-flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                                        <Brain className="w-2.5 h-2.5" />
                                                        {msg.model}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleCopy(msg.content, idx)}
                                                className="inline-flex items-center gap-0.5 hover:text-blue-600 transition-colors"
                                                title="Salin teks"
                                            >
                                                {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                                <span>{copiedIdx === idx ? 'Tersalin' : 'Salin'}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Timestamp + Edit for user message */}
                                {msg.role === 'user' && msg.timestamp && (
                                    <div className="flex items-center gap-2 px-1">
                                        <span className="text-[10px] text-gray-400">{formatTimestamp(msg.timestamp)}</span>
                                        <button
                                            onClick={() => {
                                                setInput(msg.content);
                                                setShowModelPicker(true);
                                                if (inputRef.current) {
                                                    inputRef.current.focus();
                                                    const len = msg.content.length;
                                                    if ('setSelectionRange' in inputRef.current) {
                                                        inputRef.current.setSelectionRange(len, len);
                                                    }
                                                }
                                            }}
                                            disabled={loading}
                                            className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-blue-600 transition-colors"
                                            title="Edit pesan"
                                        >
                                            <Pencil className="w-3 h-3" />
                                            Edit
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Follow-up suggestions */}
                        {msg.role === 'assistant' && msg.typed && msg.suggestions && msg.suggestions.length > 0 && (
                            <div className={`flex flex-col gap-1.5 ${isFloat ? 'pl-8' : 'pl-9'}`}>
                                {msg.suggestions.map((q, qi) => (
                                    <button
                                        key={qi}
                                        onClick={() => handleFillInput(q)}
                                        disabled={loading}
                                        className={`flex items-start gap-1.5 text-xs px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-blue-700 transition-colors disabled:opacity-50 text-left ${isFloat ? 'max-w-[260px]' : 'max-w-md'}`}
                                    >
                                        <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                        <span className={isFloat ? 'line-clamp-2' : ''}>{q}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {loading && <LoadingBubble thinking={thinkingMode === 'thinking'} />}

                {error && (
                    <div className="space-y-2">
                        <div className="text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span className="flex-1">{error}</span>
                        </div>
                        <div className="flex items-center gap-2 pl-2">
                            <button
                                onClick={() => {
                                    const lastUser = [...messages].reverse().find(m => m.role === 'user');
                                    if (lastUser) handleSend(lastUser.content);
                                }}
                                disabled={loading}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <RotateCw className="w-3 h-3" />
                                Coba lagi
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Open the top bar model selector instead of spawning a duplicate
                                    setShowModelPicker(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Brain className="w-3 h-3" />
                                Ganti model
                            </button>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Pending image preview */}
            {pendingImage && (
                <div className={`bg-white border-t border-gray-100 ${isFloat ? 'px-2.5 py-2' : 'px-4 py-2'}`}>
                    <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pendingImage} alt="terlampir" className="w-12 h-12 object-cover rounded border border-gray-200" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 font-medium">Gambar dilampirkan</p>
                            {!visionCapable && (
                                <p className="text-[10px] text-amber-600 truncate">⚠️ Model aktif tidak support gambar — pilih model dengan vision.</p>
                            )}
                        </div>
                        <button
                            onClick={() => setPendingImage(null)}
                            className="p-1 hover:bg-gray-100 rounded"
                            aria-label="Hapus gambar"
                        >
                            <X className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                    </div>
                </div>
            )}

            {/* Input bar - Modern ChatGPT/Claude style */}
            <div className={`border-t border-gray-200 bg-white ${isFloat ? 'p-2.5' : 'px-4 py-3'}`}>
                <div className={`space-y-2.5 ${isFull ? 'max-w-3xl mx-auto' : ''}`}>
                    {/* Main input area with send button */}
                    <div className="flex gap-2 items-end">
                        {isFull ? (
                            <textarea
                                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                placeholder="Tanya KR·AI..."
                                disabled={loading}
                                rows={1}
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50 resize-none bg-white shadow-sm hover:border-gray-400 transition-colors min-h-[44px] max-h-[200px]"
                                style={{ fieldSizing: 'content' } as any}
                            />
                        ) : (
                            <input
                                ref={inputRef as React.RefObject<HTMLInputElement>}
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                placeholder="Tanya KR·AI..."
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:opacity-50 bg-white shadow-sm hover:border-gray-400 transition-colors"
                            />
                        )}
                        <button
                            onClick={() => handleSend()}
                            disabled={loading || (!input.trim() && !pendingImage)}
                            className="bg-blue-600 text-white rounded-full hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 p-2.5 shadow-md hover:shadow-lg"
                            aria-label="Kirim pesan"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Model selector and Mode dropdown - Below input */}
                    {showTopBar && (
                        <div className="flex items-center justify-between gap-3 pt-1">
                            {/* Model selector — uses ChatModelSelector with fetched models */}
                            <div className="relative flex-1 min-w-0">
                                <ChatModelSelector
                                    currentModel={activeModelId}
                                    onChange={handleChatModelChange}
                                    currentProvider={activeProviderId !== 'auto' ? activeProviderId : undefined}
                                    className="max-w-[200px]"
                                    fetchedModels={availableModels}
                                    loadingModels={loadingModels}
                                    config={config}
                                />
                            </div>

                            {/* Mode dropdown */}
                            <div className="relative">
                                <select
                                    value={thinkingMode}
                                    onChange={(e) => handleThinkingChange(e.target.value as ThinkingMode)}
                                    className="px-3 py-1.5 pr-8 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200 bg-white cursor-pointer appearance-none"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25rem 1.25rem' }}
                                    aria-label="Pilih mode AI"
                                >
                                    <option value="auto">⚡ Auto</option>
                                    <option value="instant">🚀 Instant</option>
                                    <option value="thinking">🧠 Thinking</option>
                                </select>
                            </div>

                            {/* Memory button */}
                            {showMemoryButton && (
                                <button
                                    onClick={() => setShowMemory(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                                    aria-label="Buka memori"
                                >
                                    <Brain className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Memori</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Model picker dropdown ────────────────────────────────────────────────────

function ModelPickerDropdown({
    config,
    onSelect,
    onClose,
}: {
    config: MultiAIConfig;
    onSelect: (providerId: ProviderId | 'auto', modelId: string) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const configuredProviders = PROVIDERS.filter(p => config.providers[p.id]);

    return (
        <div ref={ref} className="absolute bottom-full left-0 mb-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72 max-h-80 overflow-y-auto">
            <div className="p-1">
                {/* Auto option */}
                <button
                    onClick={() => onSelect('auto', 'auto')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-blue-50 ${config.activeProvider === 'auto' ? 'bg-blue-50' : ''}`}
                >
                    <Brain className="w-3.5 h-3.5 text-blue-600" />
                    <div className="flex-1 text-left">
                        <p className="font-semibold text-gray-900">Auto</p>
                        <p className="text-[10px] text-gray-500">Pilih model otomatis sesuai mode &amp; kebutuhan</p>
                    </div>
                </button>

                {configuredProviders.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-500 text-center">
                        Belum ada provider terkonfigurasi. Buka <strong>Pengaturan</strong>.
                    </p>
                )}

                {configuredProviders.map(provider => (
                    <div key={provider.id} className="mt-1">
                        <p className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase font-semibold text-gray-400 tracking-wide">
                            {provider.name}
                        </p>
                        {provider.models.length > 0 ? provider.models.map(m => {
                            const isActive = config.activeProvider === provider.id && config.activeModel === m.id;
                            return (
                                <button
                                    key={m.id}
                                    onClick={() => onSelect(provider.id, m.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs hover:bg-blue-50 ${isActive ? 'bg-blue-50' : ''}`}
                                >
                                    <CapBadges caps={m.capabilities} />
                                    <span className="flex-1 text-left text-gray-800 truncate">{m.label}</span>
                                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                                        {m.inputPrice === 0 ? 'Gratis' : `$${m.inputPrice.toFixed(2)}`}
                                    </span>
                                </button>
                            );
                        }) : (
                            // Custom model name (openai-compatible) — show stored model id
                            <button
                                onClick={() => onSelect(provider.id, config.providers[provider.id]?.model || '')}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs hover:bg-blue-50"
                            >
                                <span className="flex-1 text-left text-gray-800 truncate">
                                    {config.providers[provider.id]?.model || '(custom)'}
                                </span>
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
