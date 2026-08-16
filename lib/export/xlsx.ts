/**
 * lib/export/xlsx.ts
 *
 * XLSX export utility for all pages.
 * Supports multiple sheets, Indonesian column names, and proper formatting.
 */

import * as XLSX from 'xlsx';
import { format } from 'date-fns';

// ─── Formula Injection Protection ────────────────────────────────
/**
 * Sanitize a string cell value to prevent CSV/XLSX formula injection.
 *
 * OWASP: Spreadsheet formula injection (A03:2021 — Injection).
 * Any string that starts with =, +, -, @, TAB (0x09), or CR (0x0D)
 * could be interpreted as a formula by Excel / LibreOffice / Google Sheets.
 * We prefix such values with a single quote ('), which forces the cell to
 * be treated as literal text by spreadsheet applications.
 *
 * Only string values are affected — numbers and dates are returned as-is.
 */
export function escapeXlsxCell(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    // Dangerous leading characters that trigger formula evaluation
    if (/^[=+\-@\t\r]/.test(value)) {
        return `'${value}`;
    }
    return value;
}

// ─── Safe Serializer ──────────────────────────────────────────────
/**
 * Sanitize raw data rows for XLSX export.
 * Converts non-serializable types: BigInt→string, Date→ISO date string,
 * objects→JSON string, null/undefined→"", Buffer→string.
 * Also applies formula injection escaping on all string values.
 */
export function safeSerialize(data: any[]): Record<string, any>[] {
    if (!data || data.length === 0) return [];
    return data.map(row => {
        const obj: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
            if (value === null || value === undefined) {
                obj[key] = '';
            } else if (typeof value === 'bigint') {
                obj[key] = escapeXlsxCell(value.toString());
            } else if (value instanceof Date) {
                // Dates are safe — ISO format does not start with formula chars
                obj[key] = value.toISOString().split('T')[0];
            } else if (Buffer.isBuffer(value)) {
                obj[key] = escapeXlsxCell(value.toString('utf8'));
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                obj[key] = escapeXlsxCell(JSON.stringify(value));
            } else {
                obj[key] = escapeXlsxCell(value);
            }
        }
        return obj;
    });
}

// ─── Types ───────────────────────────────────────────────────────
export interface ExportColumn {
    header: string; // Indonesian column name
    key: string;    // Data key
    format?: (value: any) => string | number;
}

export interface ExportSheet {
    name: string;
    columns: ExportColumn[];
    data: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────
/**
 * Format number as Indonesian Rupiah
 */
export function formatRupiah(value: number): string {
    if (value == null || isNaN(value)) return '-';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

/**
 * Format date string for display
 */
export function formatDate(value: string | Date | null): string {
    if (!value) return '-';
    try {
        const date = typeof value === 'string' ? new Date(value) : value;
        return format(date, 'dd MMM yyyy');
    } catch {
        return String(value);
    }
}

/**
 * Format date string for filename
 */
export function formatDateForFilename(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

/**
 * Export data to XLSX file
 *
 * @param sheets - Array of sheet data to export
 * @param filename - Output filename (without path)
 */
export function exportToXLSX(sheets: ExportSheet[], filename: string): void {
    const workbook = XLSX.utils.book_new();

    for (const sheet of sheets) {
        // Transform data to match column headers.
        // escapeXlsxCell() is applied to all string values to prevent formula injection.
        const rows = sheet.data.map(row => {
            const obj: Record<string, string | number | null> = {};
            for (const col of sheet.columns) {
                const rawValue = row[col.key];
                const formatted = col.format ? col.format(rawValue) : rawValue ?? '-';
                obj[col.header] = escapeXlsxCell(formatted) as string | number | null;
            }
            return obj;
        });

        // Create worksheet
        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Auto-size columns (basic)
        const colWidths = sheet.columns.map(col => ({
            wch: Math.max(col.header.length + 2, 12),
        }));
        worksheet['!cols'] = colWidths;

        // Append to workbook
        try {
            XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
        } catch {
            // If sheet name is too long or invalid, use a fallback
            XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
        }
    }

    // Write file
    XLSX.writeFile(workbook, filename);
}

/**
 * Generate export filename with standard format
 *
 * @param page - Page name (e.g., 'dashboard', 'booking')
 * @param date - Date for filename (defaults to now)
 * @returns Formatted filename like 'kr-analytics-dashboard-2026-05-31.xlsx'
 */
export function getExportFilename(page: string, date?: Date): string {
    const dateStr = formatDateForFilename(date || new Date());
    return `kr-analytics-${page}-${dateStr}.xlsx`;
}

// ─── Reusable Column Definitions ─────────────────────────────────

/**
 * Common currency column formatter
 */
export const currencyCol = (header: string, key: string): ExportColumn => ({
    header,
    key,
    format: (v: number) => formatRupiah(v),
});

/**
 * Common date column formatter
 */
export const dateCol = (header: string, key: string): ExportColumn => ({
    header,
    key,
    format: (v: string | Date) => formatDate(v),
});
