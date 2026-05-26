/**
 * Krai chat history — multi-conversation storage.
 *
 * Stored in localStorage as kr-ai-history:
 * {
 *   activeId: '...',
 *   conversations: [
 *     { id, title, messages: [{ role, content, ... }], createdAt, updatedAt }
 *   ]
 * }
 */

import type { ChatMessage } from '@/components/ai/AIChatCore';

const STORAGE_KEY = 'kr-ai-history';
const MAX_CONVERSATIONS = 50;

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
        // Cap conversations at MAX_CONVERSATIONS
        if (store.conversations.length > MAX_CONVERSATIONS) {
            // Sort by updatedAt desc, keep top N
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

/**
 * Generate a short conversation title from the first user question.
 * Max ~6 words, capitalized, no trailing punctuation.
 */
function generateTitle(firstUserMessage: string): string {
    let t = firstUserMessage.trim();
    // Remove markdown
    t = t.replace(/[*_`#>-]/g, '').trim();
    // Take first 50 chars
    if (t.length > 50) {
        const cut = t.slice(0, 50);
        const lastSpace = cut.lastIndexOf(' ');
        t = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '...';
    }
    // Strip trailing question marks/periods
    t = t.replace(/[?.!,]+$/, '').trim();
    // Capitalize first letter
    return t.charAt(0).toUpperCase() + t.slice(1);
}

export function listConversations(): Conversation[] {
    const store = loadHistory();
    return store.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveId(): string | null {
    return loadHistory().activeId;
}

export function getConversation(id: string): Conversation | undefined {
    return loadHistory().conversations.find(c => c.id === id);
}

export function createConversation(initialTitle?: string): Conversation {
    const store = loadHistory();
    const conv: Conversation = {
        id: genId(),
        title: initialTitle || 'Percakapan baru',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    store.conversations = [conv, ...store.conversations];
    store.activeId = conv.id;
    saveStore(store);
    return conv;
}

export function updateConversationMessages(id: string, messages: ChatMessage[]): Conversation | null {
    const store = loadHistory();
    const idx = store.conversations.findIndex(c => c.id === id);
    if (idx === -1) return null;
    const conv = { ...store.conversations[idx], messages, updatedAt: Date.now() };

    // Auto-generate title from first user message if still default
    if (conv.title === 'Percakapan baru' && messages.length > 0) {
        const firstUser = messages.find(m => m.role === 'user');
        if (firstUser) conv.title = generateTitle(firstUser.content);
    }

    store.conversations[idx] = conv;
    saveStore(store);
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
}

export function deleteConversation(id: string): void {
    const store = loadHistory();
    store.conversations = store.conversations.filter(c => c.id !== id);
    if (store.activeId === id) {
        store.activeId = store.conversations[0]?.id ?? null;
    }
    saveStore(store);
}

export function setActiveConversation(id: string | null): void {
    const store = loadHistory();
    store.activeId = id;
    saveStore(store);
}

export function clearAllHistory(): void {
    saveStore(EMPTY);
}
