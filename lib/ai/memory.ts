/**
 * KR·AI Memory System
 *
 * Stores key facts that the AI should remember across sessions.
 * Saved to localStorage under a single key as a list of timestamped entries.
 * The memory is injected into the system prompt so KR·AI can reference past context.
 *
 * AUTO-MEMORY: After every meaningful conversation, KRAI extracts key facts
 * automatically and stores them. No manual input needed.
 *
 * DESIGN:
 * - Max 100 entries (oldest pruned first)
 * - Each entry has: id, text, createdAt
 * - Automatic compaction: if total text > 15000 chars, oldest entries removed
 * - Exposed as: getMemoryContext() (for system prompt), and CRUD helpers
 * - Auto-extract: extractMemoryFromConversation() uses AI to extract key facts
 */

export interface MemoryEntry {
    id: string;
    text: string;
    createdAt: number; // unix ms
    /** Source: 'manual' (user-added) or 'auto' (AI-extracted) */
    source?: 'manual' | 'auto';
}

const MEMORY_KEY = 'krai-memory';
const MAX_ENTRIES = 100;
const MAX_TOTAL_CHARS = 15000;
const MAX_ENTRY_CHARS = 1000;

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

function persistEntry(entries: MemoryEntry[], entry: MemoryEntry): MemoryEntry[] {
    let updated = [...entries, entry];

    // Prune: max entries — keep newest, drop oldest
    while (updated.length > MAX_ENTRIES) updated.shift();

    // Prune: max total chars
    let totalChars = updated.reduce((s, e) => s + e.text.length, 0);
    while (totalChars > MAX_TOTAL_CHARS && updated.length > 1) {
        totalChars -= updated[0].text.length;
        updated.shift();
    }

    saveMemory(updated);
    return updated;
}

export function addMemory(text: string): MemoryEntry {
    const entries = loadMemory();
    const entry: MemoryEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: text.trim().slice(0, MAX_ENTRY_CHARS),
        createdAt: Date.now(),
        source: 'manual',
    };
    persistEntry(entries, entry);
    return entry;
}

/** Add auto-extracted memory entry (doesn't dispatch event to avoid loops). */
export function addMemoryAuto(text: string): MemoryEntry {
    const entries = loadMemory();
    // Deduplicate: skip if identical text already exists
    const normalized = text.trim().toLowerCase();
    if (entries.some(e => e.text.trim().toLowerCase() === normalized)) {
        return entries.find(e => e.text.trim().toLowerCase() === normalized)!;
    }
    const entry: MemoryEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: text.trim().slice(0, MAX_ENTRY_CHARS),
        createdAt: Date.now(),
        source: 'auto',
    };
    persistEntry(entries, entry);
    return entry;
}

/** Extract key facts from a conversation using a lightweight AI prompt.
 *  Called after each assistant response. */
export async function extractMemoryFromConversation(
    userQuestion: string,
    aiAnswer: string,
    sendChat: (msgs: any[], thinkingMode?: string) => Promise<{ message: string } | null>,
): Promise<string[]> {
    try {
        const prompt = `Kamu adalah KRAI, asisten AI Kakarama Room. Ekstrak fakta penting dari percakapan ini yang perlu diingat untuk percakapan masa depan.

HASILKAN maksimal 3 poin, masing-masing 1 kalimat singkat dalam Bahasa Indonesia.
HANYA fakta objektif/spesifik, BUKAN opini generik.
Format: satu poin per baris, tanpa nomor atau bullet.

Contoh poin bagus:
- Owner fokus meningkatkan okupansi di lokasi Bintaro yang saat ini hanya 22%
- Target revenue bulanan Rp 50 juta, saat ini baru tercapai 60%
- Lokasi Ciputat performa terbaik dengan okupansi 85% dan revenue tertinggi

Contoh poin buruk (terlalu generik, skip):
- Bisnis perlu ditingkatkan
- Okupansi penting untuk revenue

Percakapan:
Pertanyaan: ${userQuestion.slice(0, 300)}
Jawaban: ${aiAnswer.slice(0, 800)}

Fakta penting (maks 3 baris, kosongkan jika tidak ada fakta spesifik):`;

        const result = await sendChat(
            [{ role: 'user', content: prompt }],
            'instant',
        );
        if (!result) return [];
        const lines = result.message
            .split('\n')
            .map((l: string) => l.trim().replace(/^[-•*\d.)\s]+/, '').trim())
            .filter((l: string) => l.length > 15 && l.length <= 400);

        const saved: string[] = [];
        for (const line of lines.slice(0, 3)) {
            addMemoryAuto(line);
            saved.push(line);
        }
        return saved;
    } catch {
        return [];
    }
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
