/**
 * Krai Memory System
 *
 * Stores key facts that the AI should remember across sessions.
 * Saved to localStorage under a single key as a list of timestamped entries.
 * The memory is injected into the system prompt so Krai can reference past context.
 *
 * DESIGN:
 * - Max 30 entries (oldest pruned first)
 * - Each entry has: id, text, createdAt
 * - Automatic compaction: if total text > 4000 chars, oldest entries removed
 * - Exposed as: getMemoryContext() (for system prompt), and CRUD helpers
 */

export interface MemoryEntry {
    id: string;
    text: string;
    createdAt: number; // unix ms
}

const MEMORY_KEY = 'krai-memory';
const MAX_ENTRIES = 30;
const MAX_TOTAL_CHARS = 4000;

export function loadMemory(): MemoryEntry[] {
    try {
        const raw = localStorage.getItem(MEMORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as MemoryEntry[];
    } catch {
        return [];
    }
}

function saveMemory(entries: MemoryEntry[]) {
    try {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(entries));
    } catch { }
}

export function addMemory(text: string): MemoryEntry {
    const entries = loadMemory();
    const entry: MemoryEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: text.trim().slice(0, 500),
        createdAt: Date.now(),
    };
    let updated = [...entries, entry];

    // Prune: max entries
    while (updated.length > MAX_ENTRIES) updated.shift();

    // Prune: max total chars
    let totalChars = updated.reduce((s, e) => s + e.text.length, 0);
    while (totalChars > MAX_TOTAL_CHARS && updated.length > 1) {
        totalChars -= updated[0].text.length;
        updated.shift();
    }

    saveMemory(updated);
    return entry;
}

export function deleteMemory(id: string) {
    const entries = loadMemory().filter(e => e.id !== id);
    saveMemory(entries);
}

export function clearMemory() {
    localStorage.removeItem(MEMORY_KEY);
}

/** Format memory entries as a compact string for the system prompt. */
export function getMemoryContext(): string {
    const entries = loadMemory();
    if (entries.length === 0) return '';
    const lines = entries.map(e => {
        const d = new Date(e.createdAt).toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric',
        });
        return `[${d}] ${e.text}`;
    });
    return `MEMORI KRAI (catatan yang perlu diingat):\n${lines.join('\n')}`;
}
