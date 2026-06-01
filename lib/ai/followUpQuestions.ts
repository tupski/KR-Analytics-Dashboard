/**
 * lib/ai/followUpQuestions.ts
 *
 * Shared follow-up question generation for AI Insight cards.
 * Rule-based — no LLM call needed.
 * Returns Indonesian questions that user can ask KRAI.
 */

export type KraiPageContext = 'dashboard' | 'booking' | 'unit' | 'customer' | 'laporan';

export interface FollowUpContext {
    pageContext: KraiPageContext;
    insightText?: string;
    hasComparison?: boolean;
    hasActiveFilters?: boolean;
    dateRange?: string;
    kpis?: Record<string, number>;
}

/**
 * Generate contextual follow-up questions based on insight content + page context.
 * Returns up to 3 questions user can ask KRAI.
 */
export function generateFollowUpQuestions(ctx: FollowUpContext): string[] {
    const { insightText, pageContext, hasComparison, hasActiveFilters } = ctx;
    const lower = (insightText || '').toLowerCase();

    // ── Keyword-based specific questions ──
    const specific: string[] = [];

    // Revenue down
    if (lower.includes('pendapatan') && (lower.includes('turun') || lower.includes('menurun'))) {
        specific.push('Kenapa pendapatan turun?', 'Lokasi mana paling mempengaruhi?', 'Rekomendasi menaikkan pendapatan?');
    }
    // Revenue up
    else if (lower.includes('pendapatan') && (lower.includes('naik') || lower.includes('meningkat'))) {
        specific.push('Lokasi mana yang paling berkontribusi?', 'Bandingkan dengan periode sebelumnya');
    }
    // Occupancy low
    if (lower.includes('okupansi') && (lower.includes('rendah') || lower.includes('turun') || lower.includes('kritis'))) {
        specific.push('Unit mana yang paling sering kosong?', 'Strategi menaikkan okupansi?', 'Penyebab okupansi rendah?');
    }
    // Occupancy high
    else if (lower.includes('okupansi') && (lower.includes('tinggi') || lower.includes('penuh') || lower.includes('baik'))) {
        specific.push('Lokasi mana okupansi tertinggi?', 'Unit mana paling sering terisi?');
    }
    // Expenses
    if (lower.includes('pengeluaran') || lower.includes('expense') || lower.includes('biaya')) {
        if (lower.includes('naik') || lower.includes('besar') || lower.includes('tinggi')) {
            specific.push('Kategori pengeluaran paling naik?', 'Apakah normal untuk periode ini?');
        } else {
            specific.push('Kategori pengeluaran terbesar?', 'Bandingkan dengan bulan lalu?');
        }
    }
    // Booking down
    if (lower.includes('booking') && (lower.includes('turun') || lower.includes('menurun'))) {
        specific.push('Channel mana yang turun?', 'Lokasi dengan booking turun?', 'Rekomendasi meningkatkan booking?');
    }
    // Booking general
    if (lower.includes('booking') && specific.length === 0) {
        specific.push('Channel booking paling efektif?', 'Bandingkan booking dengan periode lalu?');
    }
    // Customer / Tamu
    if ((lower.includes('tamu') || lower.includes('pelanggan') || lower.includes('customer')) && specific.length === 0) {
        specific.push('Pola booking pelanggan?', 'Pelanggan yang sering booking?', 'Tingkat kunjungan ulang?');
    }
    // Marketing / Channel
    if ((lower.includes('channel') || lower.includes('marketing') || lower.includes('sumber')) && specific.length === 0) {
        specific.push('Channel mana paling efektif?', 'ROI per channel marketing?');
    }
    // Comparison
    if (hasComparison) {
        specific.push('Apa perbedaan utama dengan periode sebelumnya?');
    }
    // Filters
    if (hasActiveFilters) {
        specific.push('Bagaimana performa dengan filter saat ini?');
    }

    // ── Deduplicate, keep top 3 ──
    const unique = [...new Set(specific)].slice(0, 3);
    if (unique.length >= 2) return unique;

    // ── Page-specific fallbacks ──
    const pageDefaults: Record<KraiPageContext, string[]> = {
        dashboard: [
            'Apa yang perlu diperhatikan hari ini?',
            'Bagaimana performa dibanding kemarin?',
            'Rekomendasi untuk hari ini?',
        ],
        booking: [
            'Channel booking mana paling efektif?',
            'Bagaimana tren booking minggu ini?',
            'Lokasi dengan booking terbanyak?',
        ],
        unit: [
            'Unit mana perlu perhatian?',
            'Okupansi per lokasi?',
            'Unit paling sering kosong?',
        ],
        customer: [
            'Pola booking pelanggan setia?',
            'Tamu baru vs tamu kembali?',
            'Sumber tamu paling banyak?',
        ],
        laporan: [
            'Kategori pengeluaran terbesar?',
            'Bandingkan laba dengan periode lalu?',
            'Rekomendasi efisiensi biaya?',
        ],
    };

    return pageDefaults[pageContext] || pageDefaults.dashboard;
}
