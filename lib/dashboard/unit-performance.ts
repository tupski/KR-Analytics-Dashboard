/**
 * Unit Performance — Idle Detection & Top/Bottom Units
 *
 * Deterministic calculations, no LLM.
 * Idle detection: absolute time-based, not report-period-dependent.
 * Revenue: calendar-aligned month (intentional, not report-period-dependent).
 */
import type { IdleUnitItem, UnitIdleSeverity, UnitPerformanceItem } from '@/types/dashboard';

export interface UnitPerformanceData {
    idleUnits: IdleUnitItem[];
    topUnits: UnitPerformanceItem[];
    bottomUnits: UnitPerformanceItem[];
}

// ─── Idle Severity ────────────────────────────────────────────

export function getIdleSeverity(idleDays: number): UnitIdleSeverity {
    if (idleDays >= 14) return 'critical';
    if (idleDays >= 7) return 'action';
    if (idleDays >= 3) return 'watch';
    return 'normal';
}

export const IDLE_SEVERITY_LABELS: Record<UnitIdleSeverity, string> = {
    normal: 'Normal',
    watch: 'Pantau',
    action: 'Perlu Tindakan',
    critical: 'Kritis',
};

export const IDLE_SEVERITY_STYLES: Record<UnitIdleSeverity, { badge: string; bg: string; text: string }> = {
    normal: {
        badge: 'bg-gray-100 text-gray-700',
        bg: 'bg-gray-50',
        text: 'text-gray-600',
    },
    watch: {
        badge: 'bg-yellow-100 text-yellow-800',
        bg: 'bg-yellow-50',
        text: 'text-yellow-700',
    },
    action: {
        badge: 'bg-orange-100 text-orange-800',
        bg: 'bg-orange-50',
        text: 'text-orange-700',
    },
    critical: {
        badge: 'bg-red-100 text-red-800',
        bg: 'bg-red-50',
        text: 'text-red-700',
    },
};
