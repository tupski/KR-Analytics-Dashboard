/**
 * lib/dashboard/insights.ts
 *
 * Deterministic insight generation from existing dashboard data.
 * No LLM calls, no schema changes, no new DB queries.
 *
 * All "hari ini" data respects report_period_mode via the already-fetched KPIData
 * (which uses getTodayReportRange() / getReportPeriodRange() internally).
 */

import type {
    DashboardInsight,
    KPIData,
} from '@/types/dashboard';

export interface InsightInput {
    kpiData: KPIData;
    checkinCount: number;
    checkoutCount: number;
}

/**
 * Generate deterministic dashboard insights.
 *
 * @returns Up to 6 sorted insights (most important first).
 */
export function generateInsights(input: InsightInput): DashboardInsight[] {
    const { kpiData, checkinCount, checkoutCount } = input;
    const insights: DashboardInsight[] = [];

    let id = 0;
    const nextId = () => `insight-${++id}`;

    // ── 1. Revenue insight ──────────────────────────────────
    const rev = kpiData.revenueToday;
    const prevRev = kpiData.prev?.revenue;
    const revPct = kpiData.change?.revenueChangePct;

    if (prevRev !== undefined && prevRev > 0 && revPct !== null && revPct !== undefined) {
        if (revPct > 0) {
            insights.push({
                id: nextId(),
                title: 'Pendapatan Meningkat',
                description: `Pendapatan hari ini naik ${revPct.toFixed(1)}% dibandingkan ${kpiData.prev!.label.toLowerCase()}.`,
                severity: 'good',
                metric: 'revenue',
                trend: 'up',
            });
        } else if (revPct <= -20) {
            insights.push({
                id: nextId(),
                title: 'Pendapatan Turun Signifikan',
                description: `Pendapatan hari ini turun ${Math.abs(revPct).toFixed(1)}% dibandingkan ${kpiData.prev!.label.toLowerCase()}.`,
                severity: 'warning',
                metric: 'revenue',
                trend: 'down',
            });
        } else {
            // down < 20%
            insights.push({
                id: nextId(),
                title: 'Pendapatan Sedikit Menurun',
                description: `Pendapatan hari ini turun ${Math.abs(revPct).toFixed(1)}% dibandingkan ${kpiData.prev!.label.toLowerCase()}.`,
                severity: 'info',
                metric: 'revenue',
                trend: 'down',
            });
        }
    } else if (rev > 0) {
        // No comparison data but we have revenue — show as info
        const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format;
        insights.push({
            id: nextId(),
            title: 'Pendapatan Hari Ini',
            description: `Pendapatan hari ini ${fmt(rev)}. Aktifkan mode bandingkan untuk melihat perubahan.`,
            severity: 'info',
            metric: 'revenue',
        });
    } else {
        // No revenue data at all
        insights.push({
            id: nextId(),
            title: 'Pendapatan Hari Ini',
            description: 'Belum ada data pendapatan untuk periode ini.',
            severity: 'info',
            metric: 'revenue',
        });
    }

    // ── 2. Booking insight ──────────────────────────────────
    const book = kpiData.bookingToday;
    const prevBook = kpiData.prev?.booking;
    const bookPct = kpiData.change?.bookingChangePct;

    if (prevBook !== undefined && prevBook > 0 && bookPct !== null && bookPct !== undefined) {
        if (bookPct >= 0) {
            insights.push({
                id: nextId(),
                title: 'Booking Meningkat',
                description: `Jumlah booking hari ini naik ${bookPct.toFixed(1)}% dibandingkan ${kpiData.prev!.label.toLowerCase()} (${book} booking vs ${prevBook}).`,
                severity: 'good',
                metric: 'booking',
                trend: 'up',
            });
        } else {
            insights.push({
                id: nextId(),
                title: 'Booking Menurun',
                description: `Jumlah booking hari ini turun ${Math.abs(bookPct).toFixed(1)}% dibandingkan ${kpiData.prev!.label.toLowerCase()} (${book} booking vs ${prevBook}).`,
                severity: 'warning',
                metric: 'booking',
                trend: 'down',
            });
        }
    } else if (book > 0) {
        insights.push({
            id: nextId(),
            title: 'Booking Hari Ini',
            description: `Ada ${book} booking hari ini. Aktifkan mode bandingkan untuk melihat perubahan.`,
            severity: 'info',
            metric: 'booking',
        });
    } else {
        insights.push({
            id: nextId(),
            title: 'Booking Hari Ini',
            description: 'Belum ada data booking untuk periode ini.',
            severity: 'info',
            metric: 'booking',
        });
    }

    // ── 3. Occupancy insight ───────────────────────────────
    const occ = kpiData.avgOccupancy;

    if (occ < 40) {
        insights.push({
            id: nextId(),
            title: 'Okupansi Rendah',
            description: `Okupansi saat ini ${occ.toFixed(1)}% — masih jauh di bawah kapasitas optimal.`,
            severity: 'warning',
            metric: 'occupancy',
            trend: occ === 0 ? 'flat' : 'down',
        });
    } else if (occ >= 90) {
        insights.push({
            id: nextId(),
            title: 'Hampir Penuh',
            description: `Okupansi ${occ.toFixed(1)}% — hampir mencapai kapasitas penuh.`,
            severity: 'info',
            metric: 'occupancy',
            trend: 'up',
        });
    } else {
        // 40–85%
        insights.push({
            id: nextId(),
            title: 'Okupansi Stabil',
            description: `Okupansi saat ini ${occ.toFixed(1)}% — dalam rentang sehat.`,
            severity: 'good',
            metric: 'occupancy',
            trend: 'flat',
        });
    }

    // ── 4. Available units insight ─────────────────────────
    const avail = kpiData.availableUnits;

    if (avail < 3) {
        insights.push({
            id: nextId(),
            title: 'Unit Tersisa Sedikit',
            description: `Hanya ${avail} unit tersedia. Segera antisipasi lonjakan permintaan.`,
            severity: 'warning',
            metric: 'availability',
        });
    } else {
        insights.push({
            id: nextId(),
            title: 'Unit Tersedia',
            description: `${avail} unit tersedia saat ini.`,
            severity: 'info',
            metric: 'availability',
        });
    }

    // ── 5. Check-in / Check-out insight ────────────────────
    if (checkinCount > 0 || checkoutCount > 0) {
        const parts: string[] = [];
        if (checkinCount > 0) parts.push(`${checkinCount} check-in`);
        if (checkoutCount > 0) parts.push(`${checkoutCount} check-out`);
        insights.push({
            id: nextId(),
            title: 'Aktivitas Tamu',
            description: `Hari ini ada ${parts.join(' dan ')}.${checkinCount > 0 && checkoutCount > 0 ? ' Pastikan unit siap sebelum tamu baru datang.' : ''}`,
            severity: 'info',
            metric: 'guest-activity',
        });
    } else {
        insights.push({
            id: nextId(),
            title: 'Aktivitas Tamu',
            description: 'Tidak ada check-in atau check-out hari ini.',
            severity: 'info',
            metric: 'guest-activity',
        });
    }

    // Limit to 6 most important
    return sortInsights(insights).slice(0, 6);
}

/**
 * Sort insights by severity priority: critical → warning → info → good.
 * Within same severity, revenue/booking insights come first.
 */
function sortInsights(insights: DashboardInsight[]): DashboardInsight[] {
    const severityRank: Record<string, number> = {
        critical: 0,
        warning: 1,
        info: 2,
        good: 3,
    };

    const metricRank: Record<string, number> = {
        revenue: 0,
        booking: 1,
        occupancy: 2,
        availability: 3,
        'guest-activity': 4,
    };

    return [...insights].sort((a, b) => {
        const sDiff = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99);
        if (sDiff !== 0) return sDiff;
        return (metricRank[a.metric ?? ''] ?? 99) - (metricRank[b.metric ?? ''] ?? 99);
    });
}
