/**
 * Header-Safe String Utilities
 * 
 * HTTP headers must only contain ASCII characters (0x20-0x7E).
 * This utility sanitizes strings for use in headers by removing
 * non-ASCII characters like unicode symbols, emoji, etc.
 */

/**
 * Convert a string to header-safe ASCII format.
 * Removes non-ASCII characters while preserving readability.
 * 
 * Examples:
 * - "KR·AI" -> "KRAI"
 * - "KR•AI" -> "KRAI"
 * - "Test™" -> "Test"
 * - "Café" -> "Cafe"
 * 
 * @param name - String that may contain non-ASCII characters
 * @returns ASCII-safe string suitable for HTTP headers
 */
export function toHeaderSafeName(name: string): string {
    return name
        .normalize('NFKD') // Decompose unicode characters
        .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII (keep only printable ASCII)
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

/**
 * Common branding constants for use in headers.
 * UI should use the original branding with unicode characters.
 * Headers must use ASCII-safe versions.
 */
export const BRANDING = {
    /** Original branding with unicode - USE IN UI ONLY */
    UI: 'KR·AI',
    /** ASCII-safe branding - USE IN HEADERS */
    HEADER: 'KRAI',
} as const;

/**
 * Generate header-safe application title.
 * @param suffix - Optional suffix to append (e.g., "Chat", "Analytics")
 */
export function getHeaderSafeTitle(suffix?: string): string {
    const base = BRANDING.HEADER;
    return suffix ? `${base} ${suffix}` : base;
}
