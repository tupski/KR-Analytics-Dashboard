'use client';

export type DashboardTab = 'operasional' | 'analitik';

interface TabSwitcherProps {
    activeTab: DashboardTab;
    onTabChange: (tab: DashboardTab) => void;
}

const TABS: { key: DashboardTab; label: string; description: string }[] = [
    {
        key: 'operasional',
        label: 'Operasional',
        description: 'Data harian & check-in/out',
    },
    {
        key: 'analitik',
        label: 'Analitik',
        description: 'Performa & insight jangka panjang',
    },
];

/**
 * TabSwitcher - Minimal, clean tab navigation for the dashboard.
 * Supports keyboard navigation and has large touch targets for mobile.
 */
export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
    return (
        <div
            role="tablist"
            className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-full sm:w-fit"
        >
            {TABS.map((tab) => (
                <button
                    key={tab.key}
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    aria-controls={`panel-${tab.key}`}
                    onClick={() => onTabChange(tab.key)}
                    className={
                        `flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-w-[120px] sm:min-w-0 ` +
                        (activeTab === tab.key
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50')
                    }
                >
                    <span>{tab.label}</span>
                    <span className="text-[11px] text-gray-400 hidden sm:inline">
                        {tab.description}
                    </span>
                </button>
            ))}
        </div>
    );
}
