'use client';

import { useAppSettings } from '@/lib/contexts/AppSettingsContext';
import { REPORT_PERIOD_LABELS, REPORT_PERIOD_DESCRIPTIONS, type ReportPeriodMode } from '@/lib/reporting-period';

interface ReportPeriodChipProps {
    className?: string;
}

export default function ReportPeriodChip({ className = '' }: ReportPeriodChipProps) {
    const { settings, loading } = useAppSettings();

    if (loading) return null;

    const mode = settings.report_period_mode as ReportPeriodMode;
    const label = REPORT_PERIOD_LABELS[mode] ?? '—';
    const desc = REPORT_PERIOD_DESCRIPTIONS[mode] ?? '—';

    return (
        <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-500 bg-gray-100/80 border border-gray-200 rounded-full whitespace-nowrap ${className}`}
            title={`Periode: ${label} · ${desc}`}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            Periode: {label} · {desc}
        </span>
    );
}
