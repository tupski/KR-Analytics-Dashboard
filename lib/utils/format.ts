import { format as formatDateFns } from 'date-fns';
import { id } from 'date-fns/locale';

/**
 * Shared Formatting Utilities
 *
 * Centralized formatting functions for currency, percentage,
 * date, and compact number display across the dashboard.
 */

/**
 * Format number as Indonesian Rupiah currency.
 * Uses period (.) as thousand separator, no decimal digits.
 *
 * @example
 *   formatCurrency(1000000)    // "Rp 1.000.000"
 *   formatCurrency(33350000)   // "Rp 33.350.000"
 *   formatCurrency(850000)     // "Rp 850.000"
 */
export function formatCurrency(value: number): string {
    return `Rp ${value.toLocaleString('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
}

/**
 * Format number as percentage with configurable decimal places.
 * The input value is treated as an absolute percentage (e.g. 75.5 → "75.50%"),
 * NOT as a decimal fraction (0.755).
 *
 * @param value - percentage value (e.g. 75.5 for 75.5%)
 * @param decimals - number of decimal places (default: 2)
 *
 * @example
 *   formatPercentage(75.5)     // "75.50%"
 *   formatPercentage(100, 0)   // "100%"
 *   formatPercentage(33.333, 1) // "33.3%"
 */
export function formatPercentage(value: number, decimals = 2): string {
    return `${value.toFixed(decimals)}%`;
}

/**
 * Format a Date in Indonesian locale.
 *
 * @param date - Date object or ISO string
 * @param fmt - 'full' returns "dd MMM yyyy", 'compact' returns "dd MMM yy"
 *
 * @example
 *   formatDate('2026-06-01')          // "01 Jun 2026"
 *   formatDate(new Date(), 'compact') // "01 Jun 26"
 */
export function formatDate(date: Date | string, fmt: 'full' | 'compact' = 'full'): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (fmt === 'compact') {
        return formatDateFns(d, 'dd MMM yy', { locale: id });
    }
    return formatDateFns(d, 'dd MMM yyyy', { locale: id });
}

/**
 * Format a number in compact Indonesian notation.
 *
 * - >= 1.000.000 → "Xjt" (juta)
 * - >= 1.000 → "Xrb" (ribu)
 * - otherwise → plain string
 *
 * @example
 *   formatCompactNumber(1500000)   // "1.5jt"
 *   formatCompactNumber(1000000)   // "1jt"
 *   formatCompactNumber(5000)      // "5rb"
 *   formatCompactNumber(850)       // "850"
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
 * Format currency in Indonesian Rupiah compact notation.
 *
 * Thresholds:
 * - >= 1 Miliar (1.000.000.000) → "Rp X,Y Miliar"
 * - >= 1 Juta (1.000.000) → "Rp X,Y Jt"
 * - < 1 Juta → full format "Rp XXX.XXX"
 *
 * Decimal separator uses Indonesian comma (,).
 *
 * @example
 *   formatCurrencyCompactIDR(1_000_000)       // "Rp 1 Jt"
 *   formatCurrencyCompactIDR(33_350_000)      // "Rp 33,35 Jt"
 *   formatCurrencyCompactIDR(159_490_000)     // "Rp 159,49 Jt"
 *   formatCurrencyCompactIDR(1_250_000_000)   // "Rp 1,25 Miliar"
 *   formatCurrencyCompactIDR(12_500_000_000)  // "Rp 12,5 Miliar"
 *   formatCurrencyCompactIDR(850_000)         // "Rp 850.000"
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

/**
 * Format date in Indonesian long format.
 * @example "05 Juni 2026"
 */
export function formatDateIndonesian(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

/**
 * Format date in Indonesian compact format for tables/charts.
 * @example "05 Jun"
 */
export function formatDateCompact(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return formatDateFns(d, 'dd MMM', { locale: id });
}

/**
 * Format datetime in Indonesian format with time.
 * @example "05 Juni 2026, 14:35"
 */
/**
 * Returns current time as ISO string in WIB (Asia/Jakarta, UTC+7).
 * Use this instead of `new Date().toISOString()` for all WIB-aware queries.
 * This ensures consistency across Dashboard, Unit, Booking, and AI pages.
 */
export function getNowWIB(): string {
    const now = new Date();
    // Convert to WIB by adding 7 hours
    const wibOffset = 7 * 60; // 7 hours in minutes
    const wibTime = new Date(now.getTime() + wibOffset * 60 * 1000);
    return wibTime.toISOString();
}

export function formatDateTimeIndonesian(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
