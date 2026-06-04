/**
 * suggestionHelper — Transform AI suggestion/follow-up questions
 * into user-facing prompts and manage expand/collapse state.
 */

/**
 * Convert KRAI's follow-up question into a user intent prompt.
 *
 * Rules:
 * - Strip trailing question mark.
 * - If starts with "Apakah Anda ingin melihat" → "Ya, tampilkan ..."
 * - If starts with "Apakah Anda ingin saya menganalisis" → "Ya, analisis ..."
 * - If starts with "Apakah Anda ingin saya mengecek" → "Ya, cek ..."
 * - If starts with "Mau saya" → "Ya, ..."
 * - If starts with "Ingin" → "Ya, ..."
 * - Fallback: "Ya, lanjutkan: {cleaned}"
 */
export function suggestionToUserPrompt(question: string): string {
    let q = question.trim();

    // Strip trailing question mark, period, exclamation
    q = q.replace(/[?!.\s]+$/, '').trim();

    // Pattern matching — first match wins
    // Each pattern: [regex, (fullMatch, ...groups) => replacement]
    const patterns: [RegExp, (...args: string[]) => string][] = [
        // "Apakah Anda ingin melihat ..."
        [/^apakah\s+(anda\s+)?(ingin\s+)?melihat\s+(.*)/i, (_full: string, _anda: string, _ingin: string, rest: string) => `Ya, tampilkan ${rest.trim()}`],

        // "Apakah Anda ingin saya menganalisis ..."
        [/^apakah\s+(anda\s+)?(ingin\s+)?saya\s+menganalisis\s+(.*)/i, (_full: string, _anda: string, _ingin: string, rest: string) => `Ya, analisis ${rest.trim()}`],

        // "Apakah Anda ingin saya mengecek ..."
        [/^apakah\s+(anda\s+)?(ingin\s+)?saya\s+mengecek\s+(.*)/i, (_full: string, _anda: string, _ingin: string, rest: string) => `Ya, cek ${rest.trim()}`],

        // "Apakah Anda ingin saya cek ..."
        [/^apakah\s+(anda\s+)?(ingin\s+)?saya\s+cek\s+(.*)/i, (_full: string, _anda: string, _ingin: string, rest: string) => `Ya, cek ${rest.trim()}`],

        // "Apakah Anda ingin saya ..." generic
        [/^apakah\s+(anda\s+)?(ingin\s+)?saya\s+(.*)/i, (_full: string, _anda: string, _ingin: string, rest: string) => `Ya, ${rest.trim()}`],

        // "Apakah Anda ingin ..."
        [/^apakah\s+(anda\s+)?ingin\s+(.*)/i, (_full: string, _anda: string, rest: string) => `Ya, ingin ${rest.trim()}`],

        // "Mau saya ..."
        [/^mau\s+saya\s+(.*)/i, (_full: string, rest: string) => `Ya, ${rest.trim()}`],

        // "Ingin ..."
        [/^ingin\s+(.*)/i, (_full: string, rest: string) => `Ya, ${rest.trim()}`],

        // "Bagaimana dengan ..." → "Cek ..."
        [/^bagaimana\s+dengan\s+(.*)/i, (_full: string, rest: string) => `Cek juga ${rest.trim()}`],

        // "Bisa ..." → "Tolong ..."
        [/^bisa\s+(.*)/i, (_full: string, rest: string) => `Tolong ${rest.trim()}`],
    ];

    for (const [regex, replacer] of patterns) {
        const match = q.match(regex);
        if (match) {
            const result = replacer(...match);
            return capitalizeFirst(result);
        }
    }

    // Fallback: prepend "Ya, lanjutkan: "
    return capitalizeFirst(`Ya, lanjutkan: ${q}`);
}

function capitalizeFirst(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}
