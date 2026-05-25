'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { GitCompareArrows } from 'lucide-react';
import type { KPICompareMode } from '@/types/dashboard';

const OPTIONS: { value: KPICompareMode | ''; label: string }[] = [
    { value: '', label: 'Tanpa Bandingkan' },
    { value: 'yesterday', label: 'vs Kemarin' },
    { value: 'lastweek', label: 'vs Minggu Lalu' },
    { value: 'lastmonth', label: 'vs Bulan Lalu' },
    { value: 'lastyear', label: 'vs Tahun Lalu' },
];

interface Props {
    current: KPICompareMode | null;
}

export default function CompareSwitcher({ current }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleChange = (value: string) => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        if (value) {
            params.set('compare', value);
        } else {
            params.delete('compare');
        }
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
    };

    return (
        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <GitCompareArrows className="w-3.5 h-3.5 text-gray-500" />
            <span className="hidden sm:inline">Bandingkan:</span>
            <select
                value={current || ''}
                onChange={(e) => handleChange(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                aria-label="Bandingkan dengan periode lain"
            >
                {OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </label>
    );
}
