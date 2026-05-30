import type { LocationHealthItem, LocationHealthStatus } from '@/types/dashboard';

/**
 * Determine location health status based on occupancy rate and revenue per unit.
 *
 * Rules (deterministic, no LLM):
 * - totalUnits === 0              → 'no_data'
 * - occupancyRate < 40 AND revPerUnit < 60% avg → 'needs_attention'
 * - occupancyRate < 40           → 'low_occupancy'
 * - revPerUnit < 60% avg         → 'low_revenue'
 * - occupancyRate > 85           → 'high_occupancy'
 * - 40 <= occupancyRate <= 85    → 'healthy'
 */
export function determineLocationStatus(
    item: Pick<LocationHealthItem, 'totalUnits' | 'occupancyRate' | 'revenuePerUnit'>,
    averageRevenuePerUnit: number,
): LocationHealthStatus {
    if (item.totalUnits === 0) return 'no_data';

    const occ = item.occupancyRate;
    const rpu = item.revenuePerUnit;
    const avgRpu = averageRevenuePerUnit;
    const lowRevenueThreshold = avgRpu * 0.6;

    const isLowOccupancy = occ < 40;
    const isLowRevenue = avgRpu > 0 && rpu < lowRevenueThreshold;

    if (isLowOccupancy && isLowRevenue) return 'needs_attention';
    if (isLowOccupancy) return 'low_occupancy';
    if (isLowRevenue) return 'low_revenue';
    if (occ > 85) return 'high_occupancy';
    if (occ >= 40 && occ <= 85) return 'healthy';
    return 'no_data';
}

/**
 * Apply status to all location items, computing average RPU for threshold.
 */
export function applyLocationHealthStatuses(
    items: LocationHealthItem[],
): LocationHealthItem[] {
    const withRevenue = items.filter((i) => i.totalUnits > 0);
    const totalRpu = withRevenue.reduce((s, i) => s + i.revenuePerUnit, 0);
    const avgRpu = withRevenue.length > 0 ? totalRpu / withRevenue.length : 0;

    return items.map((item) => ({
        ...item,
        status: determineLocationStatus(item, avgRpu),
    }));
}

/** Human-readable label for each status (Bahasa Indonesia). */
export const LOCATION_STATUS_LABELS: Record<LocationHealthStatus, string> = {
    healthy: 'Sehat',
    low_occupancy: 'Okupansi Rendah',
    high_occupancy: 'Hampir Penuh',
    low_revenue: 'Revenue Rendah',
    needs_attention: 'Perlu Perhatian',
    no_data: 'Belum Ada Data',
};

/** Tailwind classes for each status. */
export const LOCATION_STATUS_STYLES: Record<
    LocationHealthStatus,
    { badge: string; bg: string; text: string }
> = {
    healthy: {
        badge: 'bg-green-100 text-green-800',
        bg: 'bg-green-50',
        text: 'text-green-700',
    },
    low_occupancy: {
        badge: 'bg-amber-100 text-amber-800',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
    },
    high_occupancy: {
        badge: 'bg-blue-100 text-blue-800',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
    },
    low_revenue: {
        badge: 'bg-amber-100 text-amber-800',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
    },
    needs_attention: {
        badge: 'bg-red-100 text-red-800',
        bg: 'bg-red-50',
        text: 'text-red-700',
    },
    no_data: {
        badge: 'bg-gray-100 text-gray-500',
        bg: 'bg-gray-50',
        text: 'text-gray-400',
    },
};
