/**
 * Safe date formatter for display in JSX.
 * Handles Date objects, strings, null, undefined — never throws.
 */
export function formatDateValue(
    value: string | Date | null | undefined,
): string {
    if (!value) return '-';

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '-';
        return value.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
        });
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
        });
    }

    return String(value);
}

/**
 * Compact date formatter for chart X-axis labels.
 */
export function formatChartDate(
    value: string | Date | null | undefined,
): string {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        timeZone: 'Asia/Jakarta',
    });
}
