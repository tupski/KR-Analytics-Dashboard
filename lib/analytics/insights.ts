/**
 * lib/analytics/insights.ts
 *
 * Rule-based fallback insight generators for all page types.
 * Used when AI insight generation fails or is disabled.
 * Returns Indonesian natural language text paragraphs.
 */

export interface InsightData {
    [key: string]: any;
}

const fmtCurrency = (val: number): string => {
    if (!val || val === 0) return 'Rp 0';
    return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
};

const fmtPercent = (val: number | null | undefined): string => {
    if (val == null) return 'N/A';
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
};

// ─── Dashboard ────────────────────────────────────────────────

function generateDashboardFallback(data?: InsightData): string {
    if (!data || !data.revenue) {
        return '**Ringkasan:** Belum ada data yang cukup untuk dianalisis pada periode ini. Silakan coba filter tanggal lain.\n\n**Rekomendasi:** Pastikan periode yang dipilih memiliki data transaksi.';
    }

    const rev = fmtCurrency(data.revenue);
    const revChange = data.revenueChange != null ? fmtPercent(data.revenueChange) : null;
    const book = data.bookingCount ?? 0;
    const bookChange = data.bookingChange != null ? fmtPercent(data.bookingChange) : null;
    const occ = data.occupancyRate ?? 0;
    const avail = data.availableUnits ?? 0;
    const checkin = data.checkinCount ?? 0;
    const checkout = data.checkoutCount ?? 0;

    let revSection = `Pendapatan: ${rev}`;
    if (revChange) revSection += ` (${revChange} vs periode sebelumnya)`;

    let occSection = `Okupansi: ${occ.toFixed(1)}%`;
    if (occ < 40) occSection += ' — masih rendah, perlu strategi promosi.';
    else if (occ >= 80) occSection += ' — cukup baik.';
    else occSection += ' — dalam rentang normal.';

    const activityParts: string[] = [];
    if (checkin > 0) activityParts.push(`${checkin} check-in`);
    if (checkout > 0) activityParts.push(`${checkout} check-out`);
    const activitySection = activityParts.length > 0
        ? `Aktivitas: ${activityParts.join(', ')} hari ini.`
        : 'Tidak ada aktivitas check-in/out untuk periode ini.';

    let rekomendasi = '';
    if (occ < 50) {
        rekomendasi = '**Rekomendasi:** Tingkatkan occupancy dengan promo khusus atau kerja sama dengan marketing channel.';
    } else if (avail < 3) {
        rekomendasi = '**Rekomendasi:** Unit hampir penuh. Siapkan tambahan stok atau optimalkan pergantian kamar.';
    } else if (data.revenueChange != null && data.revenueChange < -10) {
        rekomendasi = '**Rekomendasi:** Evaluasi strategi harga dan promosi untuk mengejar target pendapatan.';
    } else {
        rekomendasi = '**Rekomendasi:** Pertahankan performa baik. Pantau tren okupansi harian.';
    }

    return `**Ringkasan:** ${revSection}. ${book} booking tercatat${bookChange ? ` (${bookChange})` : ''}.\n\n**Analisis:** ${occSection} ${activitySection}\n\n${rekomendasi}`;
}

// ─── Booking ─────────────────────────────────────────────────

function generateBookingFallback(data?: InsightData): string {
    if (!data || !data.bookingCount) {
        return '**Ringkasan:** Belum ada data booking untuk periode ini. Silakan ubah filter tanggal.\n\n**Rekomendasi:** Periksa apakah filter tanggal sudah sesuai dengan periode yang diinginkan.';
    }

    const count = data.bookingCount;
    const revenue = fmtCurrency(data.totalRevenue ?? 0);
    const avgDay = fmtCurrency(data.avgPerDay ?? 0);
    const txCount = data.totalTransactions ?? 0;

    let compareSection = '';
    if (data.prevBookingCount != null && data.prevRevenue != null) {
        const bookDelta = count - data.prevBookingCount;
        const revDelta = (data.totalRevenue ?? 0) - data.prevRevenue;
        const label = data.comparisonLabel || 'periode sebelumnya';
        const bookDir = bookDelta >= 0 ? 'naik' : 'turun';
        const revDir = revDelta >= 0 ? 'naik' : 'turun';
        compareSection = `\n\n**Perbandingan:** Booking ${bookDir} ${Math.abs(bookDelta)} transaksi dibanding ${label}. Pendapatan ${revDir} ${fmtCurrency(Math.abs(revDelta))}.`;
    }

    return `**Ringkasan:** Terdapat ${count} booking dengan total pendapatan ${revenue} dari ${txCount} transaksi. Rata-rata ${avgDay} per hari.${compareSection}\n\n**Rekomendasi:** Pantau channel marketing yang paling aktif dan optimalkan sumber booking terbesar.`;
}

// ─── Unit ─────────────────────────────────────────────────────

function generateUnitFallback(data?: InsightData): string {
    if (!data || !data.totalUnits) {
        return '**Ringkasan:** Data unit belum tersedia untuk periode ini.\n\n**Rekomendasi:** Pastikan data kamar sudah terisi dengan benar di sistem.';
    }

    const total = data.totalUnits;
    const occupied = data.occupiedToday ?? 0;
    const available = data.availableToday ?? 0;
    const occRate = data.occupancyRate ?? 0;

    let locSection = '';
    if (data.locationSummaries && data.locationSummaries.length > 0) {
        const top = data.locationSummaries
            .sort((a: any, b: any) => b.occupancyRate - a.occupancyRate);
        const best = top[0];
        const worst = top[top.length - 1];
        locSection = `\nLokasi dengan okupansi tertinggi: ${best.name} (${best.occupancyRate.toFixed(1)}%). Terendah: ${worst.name} (${worst.occupancyRate.toFixed(1)}%).`;
    }

    let rekomendasi = '';
    if (occRate < 40) {
        rekomendasi = '**Rekomendasi:** Okupansi rendah. Dorong pemasaran untuk lokasi dengan performa kurang.';
    } else if (occRate >= 85) {
        rekomendasi = '**Rekomendasi:** Okupansi tinggi. Optimalkan pergantian kamar dan pastikan kebersihan unit.';
    } else {
        rekomendasi = '**Rekomendasi:** Performa unit dalam kondisi stabil. Pantau lokasi dengan okupansi di bawah rata-rata.';
    }

    return `**Ringkasan:** ${total} total unit, ${occupied} terisi (${occRate.toFixed(1)}%), ${available} tersedia.${locSection}\n\n**Analisis:** Tingkat okupansi ${occRate >= 70 ? 'cukup baik' : 'perlu perhatian'}.\n\n${rekomendasi}`;
}

// ─── Customer ────────────────────────────────────────────────

function generateCustomerFallback(data?: InsightData): string {
    if (!data || !data.totalCustomers) {
        return '**Ringkasan:** Data pelanggan belum tersedia. Silakan ubah filter atau coba lagi.\n\n**Rekomendasi:** Pastikan periode yang dipilih memiliki data transaksi.';
    }

    const total = data.totalCustomers;
    const unique = data.uniqueCustomers ?? 0;
    const repeatRatio = total > 0 ? ((total - unique) / total * 100) : 0;

    return `**Ringkasan:** ${total} total transaksi dari ${unique} tamu unik selama periode ini. ${repeatRatio.toFixed(1)}% adalah tamu yang kembali menginap.\n\n**Analisis:** ${repeatRatio > 30 ? 'Tingkat kunjungan ulang cukup baik, menunjukkan kepuasan pelanggan.' : repeatRatio > 10 ? 'Beberapa tamu kembali menginap. Tingkatkan program loyalitas.' : 'Mayoritas tamu baru. Perkuat strategi retensi pelanggan.'}\n\n**Rekomendasi:** Identifikasi tamu dengan frekuensi tinggi dan berikan penawaran khusus untuk meningkatkan loyalitas.`;
}

// ─── Laporan ─────────────────────────────────────────────────

function generateLaporanFallback(data?: InsightData): string {
    if (!data || !data.totalRevenue) {
        return '**Ringkasan:** Data laporan keuangan belum tersedia. Silakan coba periode lain.\n\n**Rekomendasi:** Pastikan data transaksi dan pengeluaran sudah diinput untuk periode ini.';
    }

    const revenue = fmtCurrency(data.totalRevenue);
    const expenses = fmtCurrency(data.totalExpenses ?? 0);
    const netProfit = fmtCurrency((data.totalRevenue ?? 0) - (data.totalExpenses ?? 0));
    const txCount = data.totalTransactions ?? 0;

    let compareSection = '';
    if (data.prevRevenue != null) {
        const revDelta = (data.totalRevenue ?? 0) - data.prevRevenue;
        const expDelta = (data.totalExpenses ?? 0) - (data.prevExpenses ?? 0);
        const label = data.comparisonLabel || 'periode sebelumnya';
        compareSection = `\n\n**Perbandingan:** Pendapatan ${revDelta >= 0 ? `naik ${fmtCurrency(revDelta)}` : `turun ${fmtCurrency(Math.abs(revDelta))}`} dibanding ${label}. Pengeluaran ${expDelta >= 0 ? `naik ${fmtCurrency(expDelta)}` : `turun ${fmtCurrency(Math.abs(expDelta))}`}.`;
    }

    let expenseSection = '';
    if (data.expenseCategories && data.expenseCategories.length > 0) {
        const top = data.expenseCategories.slice(0, 3);
        expenseSection = '\n\n**Pengeluaran Terbesar:** ' + top.map((e: any) => `${e.category || e.cat}: ${fmtCurrency(e.total || e.total_expense)}`).join(', ');
    }

    let rekomendasi = '';
    if (data.totalExpenses > data.totalRevenue * 0.8) {
        rekomendasi = '**Rekomendasi:** Rasio pengeluaran terhadap pendapatan tinggi. Evaluasi efisiensi biaya operasional.';
    } else if (data.totalExpenses > data.totalRevenue * 0.5) {
        rekomendasi = '**Rekomendasi:** Pantau pengeluaran kategori terbesar dan cari peluang efisiensi.';
    } else {
        rekomendasi = '**Rekomendasi:** Struktur biaya terkendali. Fokus pada pertumbuhan pendapatan.';
    }

    return `**Ringkasan:** Pendapatan ${revenue} dari ${txCount} transaksi. Total pengeluaran ${expenses}. Laba bersih ${netProfit}.${expenseSection}${compareSection}\n\n${rekomendasi}`;
}

// ─── Main Dispatch ───────────────────────────────────────────

export function generateFallbackInsight(page: string, data?: InsightData): string {
    try {
        switch (page) {
            case 'dashboard':
                return generateDashboardFallback(data);
            case 'booking':
                return generateBookingFallback(data);
            case 'unit':
                return generateUnitFallback(data);
            case 'customer':
                return generateCustomerFallback(data);
            case 'laporan':
                return generateLaporanFallback(data);
            default:
                return '**Ringkasan:** Data untuk halaman ini belum tersedia. Silakan coba lagi nanti.';
        }
    } catch (err) {
        console.error('[insights] Fallback generator error:', err);
        return '**Ringkasan:** Maaf, tidak dapat menghasilkan insight saat ini. Silakan coba lagi.';
    }
}
