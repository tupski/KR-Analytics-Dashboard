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
 * TabSwitcher — Clear, interactive tab navigation for dashboard.
 * Active state uses filled bg + shadow. Inactive uses outline style
 * to remain obviously clickable. Large touch targets for mobile.
 */
export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
    return (
        <div
            role="tablist"
            className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-1 w-full sm:w-fit"
        >
            {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`panel-${tab.key}`}
                        onClick={() => onTabChange(tab.key)}
                        className={
                            `flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer flex-1 sm:flex-initial ` +
                            (isActive
                                ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                                : 'text-gray-500 border border-transparent hover:text-gray-700 hover:bg-gray-100')
                        }
                    >
                        <span>{tab.label}</span>
                        <span className="text-[11px] text-gray-400 hidden sm:inline">
                            {tab.description}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
