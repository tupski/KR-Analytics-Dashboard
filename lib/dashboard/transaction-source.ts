// Shared canonical query helpers for transaction source-of-truth.
// All dashboard modules import these to stay consistent with KR laporan pemasukan.

/** SQL snippet for effective transaction date: checkin_at if available, else created_at */
export const SQL_EFFECTIVE_DATE = "COALESCE(checkin_at, created_at)";

/** SQL snippet for revenue calculation: cash + transfer (excludes deposit/nominal) */
export const SQL_REVENUE = "COALESCE(cash_amount, 0) + COALESCE(transfer_amount, 0)";

/** JS helper: compute revenue from a transaction row */
export function calcRevenue(tx: { cash_amount?: number | null; transfer_amount?: number | null }): number {
    return (tx.cash_amount ?? 0) + (tx.transfer_amount ?? 0);
}

/** JS helper: compute effective date from a transaction row (returns ISO string) */
export function effectiveDate(tx: { checkin_at?: string | null; created_at?: string | null }): string {
    return tx.checkin_at ?? tx.created_at ?? '';
}

/**
 * Build date boundaries with exclusive end.
 * startDate: inclusive (>= startDate)
 * endDate: exclusive (< endDate — add 1 day to start)
 */
export function exclusiveRange(startDate: Date | string): { startISO: string; endISO: string } {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const startISO = start.toISOString();
    const end = new Date(start.getTime() + 86400000);
    const endISO = end.toISOString();
    return { startISO, endISO };
}
