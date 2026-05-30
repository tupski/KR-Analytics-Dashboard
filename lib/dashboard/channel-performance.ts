/**
 * Channel Performance — Marketing/Source Channel Status & Insights
 *
 * Deterministic calculations, no LLM.
 * Status rules based on revenue share thresholds.
 */
import type { ChannelPerformanceItem, ChannelPerformanceStatus } from '@/types/dashboard';

const STRONG_REVENUE_THRESHOLD = 0.25; // top 25% of revenue share
const WEAK_REVENUE_THRESHOLD = 0.05;   // less than 5% share

export function getChannelStatus(
    item: ChannelPerformanceItem,
    allItems: ChannelPerformanceItem[]
): ChannelPerformanceStatus {
    if (!item.channel || item.channel === 'Tidak Diketahui' || item.transactionCount === 0) {
        return 'unknown';
    }

    // Sort by revenue desc and find rank
    const sorted = [...allItems].sort((a, b) => b.totalRevenue - a.totalRevenue);
    const rank = sorted.findIndex(i => i.channel === item.channel);
    const isTop3 = rank >= 0 && rank < 3;
    const isStrongRevenue = item.percentageOfRevenue >= 25;

    // Strong: Top 3 revenue OR >= 25% revenue share
    if (isTop3 || isStrongRevenue) return 'strong';

    // Weak: revenue share < 5% but has transactions
    if (item.percentageOfRevenue < 5 && item.transactionCount > 0) return 'weak';

    // Normal: has transactions and stable
    if (item.transactionCount > 0) return 'normal';

    return 'unknown';
}

// Normalize channel name — use as-is or map known aliases
export function normalizeChannelName(raw: string | null | undefined): string {
    if (!raw || raw.trim() === '') return 'Tidak Diketahui';
    const trimmed = raw.trim();
    // Map known variations if needed
    return trimmed;
}

// Label for status
export const CHANNEL_STATUS_LABELS: Record<ChannelPerformanceStatus, string> = {
    strong: 'Bagus',
    normal: 'Normal',
    weak: 'Perlu Evaluasi',
    unknown: 'Tidak Diketahui',
};

// Color classes for status badges
export const CHANNEL_STATUS_STYLES: Record<ChannelPerformanceStatus, string> = {
    strong: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    normal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    weak: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    unknown: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export function generateChannelInsights(items: ChannelPerformanceItem[]): string[] {
    const insights: string[] = [];
    const sorted = [...items].sort((a, b) => b.totalRevenue - a.totalRevenue);
    const unknown = items.find(i => i.channel === 'Tidak Diketahui');

    if (sorted.length > 0 && sorted[0].percentageOfRevenue > 0) {
        insights.push(`Channel ${sorted[0].channel} menyumbang ${sorted[0].percentageOfRevenue.toFixed(0)}% revenue periode ini.`);
    }

    const weakChannels = items.filter(i => i.status === 'weak');
    weakChannels.forEach(c => {
        insights.push(`Channel ${c.channel} memiliki kontribusi revenue rendah (${c.percentageOfRevenue.toFixed(1)}%) dan perlu dievaluasi.`);
    });

    if (unknown && unknown.transactionCount > 0) {
        insights.push(`${unknown.transactionCount} transaksi belum memiliki sumber channel.`);
    }

    return insights;
}
