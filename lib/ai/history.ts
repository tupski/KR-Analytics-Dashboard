/**
 * Krai chat history — dual-layer storage.
 *
 * Primary: localStorage (instant reads/writes, offline-capable)
 * Backup:  Supabase via /api/krai/history (async, background sync)
 *
 * All reads come from localStorage for speed.
 * All writes go to localStorage immediately, then fire-and-forget to Supabase.
 * On page load, Supabase list is merged into localStorage (remote wins for title).
 */

import type { ChatMessage } from '@/components/ai/AIChatCore';

const STORAGE_KEY = 'kr-ai-history';
const MAX_CONVERSATIONS = 100;

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export interface ChatHistoryStore {
    activeId: string | null;
    conversations: Conversation[];
}

const EMPTY: ChatHistoryStore = { activeId: null, conversations: [] };

// ── localStorage helpers ──────────────────────────────────────────────────────

export function loadHistory(): ChatHistoryStore {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...EMPTY };
        const parsed = JSON.parse(raw) as ChatHistoryStore;
        if (!Array.isArray(parsed.conversations)) return { ...EMPTY };
        return parsed;
    } catch {
        return { ...EMPTY };
    }
}

function saveStore(store: ChatHistoryStore) {
    try {
        if (store.conversations.length > MAX_CONVERSATIONS) {
            store.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
            store.conversations = store.conversations.slice(0, MAX_CONVERSATIONS);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        window.dispatchEvent(new Event('kr-ai-history-changed'));
    } catch { }
}

function genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function generateTitle(firstUserMessage: string): string {
    let t = firstUserMessage.trim().replace(/[*_`#>-]/g, '').trim();
    if (t.length > 50) {
        const cut = t.slice(0, 50);
        const lastSpace = cut.lastIndexOf(' ');
        t = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '...';
    }
    t = t.replace(/[?.!,]+$/, '').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Supabase sync (fire-and-forget) ──────────────────────────────────────────

function syncUpsert(conv: Conversation): void {
    // Only messages with typed=true (fully displayed) to avoid partial state
    const msgs = conv.messages.map(m => ({ ...m, typed: true, suggestions: undefined }));
    fetch('/api/krai/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert', id: conv.id, title: conv.title, messages: msgs }),
    }).catch(() => { /* silent */ });
}

function syncDelete(id: string): void {
    fetch('/api/krai/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
    }).catch(() => { /* silent */ });
}

function syncRename(id: string, title: string): void {
    fetch('/api/krai/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', id, title }),
    }).catch(() => { /* silent */ });
}

/**
 * On app startup, merge remote conversations into localStorage.
 * Remote title takes precedence; remote messages fill local gaps.
 * Call once on first page load (non-blocking).
 */
export async function syncFromRemote(): Promise<void> {
    try {
        const res = await fetch('/api/krai/history');
        if (!res.ok) return;
        const { conversations: remote } = await res.json() as {
            conversations: Array<{ id: string; title: string; updatedAt: string }>;
        };
        if (!Array.isArray(remote) || remote.length === 0) return;

        const store = loadHistory();
        const localMap = new Map(store.conversations.map(c => [c.id, c]));

        remote.forEach(r => {
            const local = localMap.get(r.id);
            if (!local) {
                // Remote has it but local doesn't — add stub (messages loaded on demand)
                store.conversations.push({
                    id: r.id,
                    title: r.title,
                    messages: [],
                    createdAt: new Date(r.updatedAt).getTime(),
                    updatedAt: new Date(r.updatedAt).getTime(),
                });
            } else if (r.title !== local.title && r.title !== 'Percakapan baru') {
                // Remote title is more descriptive — update local
                local.title = r.title;
            }
        });

        saveStore(store);
    } catch { /* silent */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listConversations(): Conversation[] {
    return loadHistory().conversations.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveId(): string | null {
    return loadHistory().activeId;
}

export function getConversation(id: string): Conversation | undefined {
    return loadHistory().conversations.find(c => c.id === id);
}

/**
 * Load conversation from Supabase if not in localStorage.
 * Returns the conversation with messages populated.
 */
export async function getConversationWithMessages(id: string): Promise<Conversation | null> {
    const local = getConversation(id);
    if (local && local.messages.length > 0) return local;

    try {
        const res = await fetch(`/api/krai/history?id=${encodeURIComponent(id)}`);
        if (!res.ok) return local || null;
        const { conversation } = await res.json();
        if (!conversation) return local || null;

        // Cache in localStorage
        const store = loadHistory();
        const idx = store.conversations.findIndex(c => c.id === id);
        const merged: Conversation = {
            id: conversation.id,
            title: conversation.title,
            messages: conversation.messages,
            createdAt: new Date(conversation.createdAt).getTime(),
            updatedAt: new Date(conversation.updatedAt).getTime(),
        };
        if (idx !== -1) {
            store.conversations[idx] = merged;
        } else {
            store.conversations.unshift(merged);
        }
        saveStore(store);
        return merged;
    } catch {
        return local || null;
    }
}

export function createConversation(customId?: string, initialTitle?: string): Conversation {
    const store = loadHistory();
    const conv: Conversation = {
        id: customId || genId(),
        title: initialTitle || 'Percakapan baru',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    store.conversations = store.conversations.filter(c => c.id !== conv.id);
    store.conversations = [conv, ...store.conversations];
    store.activeId = conv.id;
    saveStore(store);
    // Sync new (empty) conversation to Supabase
    syncUpsert(conv);
    return conv;
}

export function updateConversationMessages(id: string, messages: ChatMessage[]): Conversation | null {
    const store = loadHistory();
    const idx = store.conversations.findIndex(c => c.id === id);
    if (idx === -1) return null;

    const conv = { ...store.conversations[idx], messages, updatedAt: Date.now() };

    // Auto-generate title if still default
    if (conv.title === 'Percakapan baru' && messages.length > 0) {
        const firstUser = messages.find(m => m.role === 'user');
        if (firstUser) conv.title = generateTitle(firstUser.content);
    }

    store.conversations[idx] = conv;
    saveStore(store);
    syncUpsert(conv);
    return conv;
}

export function renameConversation(id: string, newTitle: string): void {
    const store = loadHistory();
    const idx = store.conversations.findIndex(c => c.id === id);
    if (idx === -1) return;
    store.conversations[idx] = {
        ...store.conversations[idx],
        title: newTitle.trim() || 'Percakapan',
        updatedAt: Date.now(),
    };
    saveStore(store);
    syncRename(id, newTitle.trim() || 'Percakapan');
}

export function deleteConversation(id: string): void {
    const store = loadHistory();
    store.conversations = store.conversations.filter(c => c.id !== id);
    if (store.activeId === id) {
        store.activeId = store.conversations[0]?.id ?? null;
    }
    saveStore(store);
    syncDelete(id);
}

export function setActiveConversation(id: string | null): void {
    const store = loadHistory();
    store.activeId = id;
    saveStore(store);
}

export function clearAllHistory(): void {
    const store = loadHistory();
    store.conversations.forEach(c => syncDelete(c.id));
    saveStore(EMPTY);
}
