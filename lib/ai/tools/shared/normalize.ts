// lib/ai/tools/shared/normalize.ts

export type TransactionStay = {
    customer_name: string | null;
    apartment_location: string | null;
    room_number: string | null;
    checkin_at: string | null;
    created_at: string | null;
    checkout_at: string | null;
    rental_duration: number | string | null;
};

export function normalizeText(input?: string | null): string {
    return (input || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/\s+/g, ' ')
        .trim();
}

/** Known location aliases — map to canonical names */
const LOCATION_ALIASES: Record<string, string> = {
    'sky house bsd': 'Sky House BSD',
    'skyhouse bsd': 'Sky House BSD',
    'sh bsd': 'Sky House BSD',
    'emerald': 'Emerald Bintaro',
    'emerald bintaro': 'Emerald Bintaro',
    'green pramuka': 'Green Pramuka Jkt',
    'green pramuka jkt': 'Green Pramuka Jkt',
    'tokyo pik 2': 'Tokyo Riverside Pik 2',
    'tokyo riverside pik 2': 'Tokyo Riverside Pik 2',
    'sky house': 'Sky House BSD',
    'pramuka': 'Green Pramuka Jkt',
};

export function resolveLocation(input?: string | null): string | null {
    if (!input) return null;
    const key = normalizeText(input);
    return LOCATION_ALIASES[key] || input.trim();
}

export function fuzzyLocationMatch(requested: string | null | undefined, actual: string | null | undefined): boolean {
    if (!requested || !actual) return false;
    const a = normalizeText(requested);
    const b = normalizeText(actual);
    // Direct contains
    if (b.includes(a) || a.includes(b)) return true;
    // Try partial word match
    const aWords = a.split(/\s+/);
    const bWords = b.split(/\s+/);
    return aWords.some((w: string) => w.length > 2 && bWords.some((bw: string) => bw.includes(w) || w.includes(bw)));
}

export function fuzzyNameMatch(requested: string | null | undefined, actual: string | null | undefined): boolean {
    if (!requested || !actual) return false;
    const a = normalizeText(requested);
    const b = normalizeText(actual);
    if (b.includes(a) || a.includes(b)) return true;
    // Partial word match
    const aWords = a.split(/\s+/);
    const bWords = b.split(/\s+/);
    return aWords.some((w: string) => w.length > 1 && bWords.includes(w));
}

export function getEffectiveCheckinAt(tx: TransactionStay): string | null {
    return tx.checkin_at ?? tx.created_at;
}

export function calcStayEndAt(tx: TransactionStay): Date {
    if (tx.checkout_at) return new Date(tx.checkout_at);
    const start = new Date(tx.checkin_at || tx.created_at || new Date());
    const hours = Number(tx.rental_duration || 1);
    return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

export function isCurrentlyStaying(tx: TransactionStay, now: Date = new Date()): boolean {
    const startRaw = getEffectiveCheckinAt(tx);
    if (!startRaw) return false;
    const start = new Date(startRaw);
    const end = calcStayEndAt(tx);
    return now >= start && now < end;
}

export function formatTimeWIB(isoString: string | null | undefined): string {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '-';
    }
}

export function formatDateWIB(isoString: string | null | undefined): string {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return '-';
    }
}
