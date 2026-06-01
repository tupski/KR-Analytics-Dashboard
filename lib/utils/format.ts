import { format as formatDateFns } from 'date-fns';
import { id } from 'date-fns/locale';

/**
 * Shared Formatting Utilities
 *
 * Centralized formatting functions for currency, percentage,
 * date, and compact number display across the dashboard.
 */

/**
 * Format number as Indonesian Rupiah currency
 * Format: Rp X.XXX.XXX (period as thousand separator, no decimals)
 */
export function formatCurrency(value: number): string {
    return `Rp ${value.toLocaleString('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
}

/**
 * Format number as percentage with configurable decimal places
 * @param value - decimal fraction or percentage value
 * @param decimals - decimal places (default: 2)
 */
export function formatPercentage(value: number, decimals = 2): string {
    return `${value.toFixed(decimals)}%`;
}

/**
 * Format a Date as dd MMM yyyy in Indonesian locale (or compact variant)
 */
export function formatDate(date: Date | string, fmt: 'full' | 'compact' = 'full'): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (fmt === 'compact') {
        return formatDateFns(d, 'dd MMM yy', { locale: id });
    }
    return formatDateFns(d, 'dd MMM yyyy', { locale: id });
}

/**
 * Format a number in compact notation (e.g., 1500 → "1.5rb", 1000000 → "1jt")
 */
export function formatCompactNumber(value: number): string {
    if (value >= 1_000_000) {
        const jt = value / 1_000_000;
        return jt % 1 === 0 ? `${jt}jt` : `${jt.toFixed(1)}jt`;
    }
    if (value >= 1_000) {
        const rb = value / 1_000;
        return rb % 1 === 0 ? `${rb}rb` : `${rb.toFixed(1)}rb`;
    }
    return value.toString();
}

/**
 * Format currency in Indonesian compact notation.
 *
 * - < 1jt → full "Rp 850.000"
 * - 1jt – 999jt → "Rp 33,35 Jt" (comma decimal, "Jt" suffix)
 * - >= 1Miliar → "Rp 1,25 Miliar"
 *
 * Examples:
 *   1.000.000      → "Rp 1 Jt"
 *   33.350.000     → "Rp 33,35 Jt"
 *   159.490.000    → "Rp 159,49 Jt"
 *   1.250.000.000  → "Rp 1,25 Miliar"
 *   12.500.000.000 → "Rp 12,5 Miliar"
 *   850.000        → "Rp 850.000"
 */
export function formatCurrencyCompactIDR(value: number): string {
    if (value >= 1_000_000_000) {
        const miliar = value / 1_000_000_000;
        const formatted = miliar % 1 === 0
            ? miliar.toLocaleString('id-ID', { maximumFractionDigits: 0 })
            : miliar.toLocaleString('id-ID', { maximumFractionDigits: 2, minimumFractionDigits: 1 });
        return `Rp ${formatted} Miliar`;
    }
    if (value >= 1_000_000) {
        const jt = value / 1_000_000;
        const formatted = jt % 1 === 0
            ? jt.toLocaleString('id-ID', { maximumFractionDigits: 0 })
            : jt.toLocaleString('id-ID', { maximumFractionDigits: 2, minimumFractionDigits: 1 });
        return `Rp ${formatted} Jt`;
    }
    return `Rp ${value.toLocaleString('id-ID')}`;
}
