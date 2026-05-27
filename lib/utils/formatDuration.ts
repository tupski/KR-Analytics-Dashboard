/**
 * Format rental duration based on classification:
 * - Transit: 1-11 jam → "Transit - X Jam"
 * - Fullday: 12-23 jam → "Fullday"
 * - Per Malam: 24-47 jam → "Per Malam - 1 Malam"
 * - Per Malam: 48+ jam → "Per Malam - 2+ Malam"
 */
export function formatDuration(hours: number): string {
    // Transit: 1-11 jam
    if (hours >= 1 && hours <= 11) {
        return `Transit - ${hours} Jam`;
    }

    // Fullday: 12-23 jam
    if (hours >= 12 && hours <= 23) {
        return 'Fullday';
    }

    // Per Malam - 1 Malam: 24-47 jam
    if (hours >= 24 && hours <= 47) {
        return 'Per Malam - 1 Malam';
    }

    // Per Malam - 2+ Malam: 48+ jam
    if (hours >= 48) {
        return 'Per Malam - 2+ Malam';
    }

    // Fallback
    return `${hours} Jam`;
}