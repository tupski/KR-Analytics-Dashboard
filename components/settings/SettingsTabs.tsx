'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Settings, Sparkles, Lightbulb, Palette, Server } from 'lucide-react';

const TABS = [
    { id: 'umum', label: 'Umum', icon: Settings },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'insight', label: 'Insight Dashboard', icon: Lightbulb },
    { id: 'tampilan', label: 'Tampilan', icon: Palette },
    { id: 'sistem', label: 'Sistem', icon: Server },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function useActiveTab(): TabId {
    const params = useSearchParams();
    const tab = params.get('tab') as TabId | null;
    if (tab && TABS.some(t => t.id === tab)) return tab;
    return 'umum';
}

export default function SettingsTabs() {
    const activeTab = useActiveTab();
    const router = useRouter();
    const pathname = usePathname();

    const setTab = (id: TabId) => {
        const params = new URLSearchParams();
        if (id !== 'umum') params.set('tab', id);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="border-b border-gray-200 overflow-x-auto -mx-4 lg:-mx-6 px-4 lg:px-6">
            <div className="flex gap-1 min-w-max pb-px">
                {TABS.map(t => {
                    const active = activeTab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${active
                                ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            <t.icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
