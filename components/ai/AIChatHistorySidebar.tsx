'use client';

/**
 * Chat history sidebar (ChatGPT style).
 * Lives below the templates section in the fullscreen chat layout.
 */

import { useEffect, useState } from 'react';
import { MessageSquarePlus, Search, MoreVertical, Pencil, Trash2, Check, X, MessageCircle } from 'lucide-react';
import {
    listConversations,
    deleteConversation,
    renameConversation,
    setActiveConversation,
    type Conversation,
} from '@/lib/ai/history';

interface Props {
    activeId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
}

export default function AIChatHistorySidebar({ activeId, onSelect, onNew }: Props) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [search, setSearch] = useState('');
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');

    const refresh = () => {
        setConversations(listConversations());
    };

    useEffect(() => {
        refresh();
        const handler = () => refresh();
        window.addEventListener('kr-ai-history-changed', handler);
        return () => window.removeEventListener('kr-ai-history-changed', handler);
    }, []);

    const filtered = conversations.filter(c =>
        !search.trim() || c.title.toLowerCase().includes(search.toLowerCase())
    );

    const handleStartRename = (c: Conversation) => {
        setRenamingId(c.id);
        setRenameDraft(c.title);
        setOpenMenuId(null);
    };

    const handleConfirmRename = () => {
        if (renamingId && renameDraft.trim()) {
            renameConversation(renamingId, renameDraft);
            refresh();
        }
        setRenamingId(null);
    };

    const handleDelete = (id: string) => {
        if (confirm('Hapus percakapan ini?')) {
            deleteConversation(id);
            refresh();
            setOpenMenuId(null);
        }
    };

    const handleNew = () => {
        const newId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        onNew();
        // Navigation is handled by parent via router.push in AIChatFullscreen
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex-1">
                    Riwayat Chat
                </span>
                <button
                    onClick={handleNew}
                    title="Chat baru"
                    className="p-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                >
                    <MessageSquarePlus className="w-4 h-4" />
                </button>
            </div>

            {/* Search */}
            {conversations.length > 0 && (
                <div className="px-3 py-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Cari percakapan..."
                            className="w-full pl-7 pr-2 py-1.5 text-[11px] border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
                {filtered.length === 0 && (
                    <div className="text-center py-6 px-3">
                        <MessageCircle className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                        <p className="text-[11px] text-gray-500">
                            {conversations.length === 0
                                ? 'Belum ada riwayat. Mulai percakapan baru.'
                                : 'Tidak ada hasil pencarian.'}
                        </p>
                    </div>
                )}
                {filtered.map(c => {
                    const isActive = c.id === activeId;
                    const isRenaming = c.id === renamingId;
                    return (
                        <div
                            key={c.id}
                            className={`group relative rounded-lg mb-0.5 transition-colors ${isActive
                                ? 'bg-blue-50'
                                : 'hover:bg-gray-50'
                                }`}
                        >
                            {isRenaming ? (
                                <div className="flex items-center gap-1 px-2 py-1.5">
                                    <input
                                        type="text"
                                        value={renameDraft}
                                        onChange={e => setRenameDraft(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleConfirmRename();
                                            if (e.key === 'Escape') setRenamingId(null);
                                        }}
                                        autoFocus
                                        className="flex-1 px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <button
                                        onClick={handleConfirmRename}
                                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                    >
                                        <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => setRenamingId(null)}
                                        className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => onSelect(c.id)}
                                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg ${isActive ? 'text-blue-700' : 'text-gray-700'}`}
                                    >
                                        <MessageCircle className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
                                        <span className="text-xs truncate flex-1 pr-6">{c.title}</span>
                                    </button>
                                    {/* Menu trigger */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuId(openMenuId === c.id ? null : c.id);
                                        }}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:bg-white hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <MoreVertical className="w-3 h-3" />
                                    </button>
                                    {/* Dropdown menu */}
                                    {openMenuId === c.id && (
                                        <div className="absolute right-0 top-full mt-0.5 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                                            <button
                                                onClick={() => handleStartRename(c)}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                            >
                                                <Pencil className="w-3 h-3" />
                                                Ubah nama
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c.id)}
                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                Hapus
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
