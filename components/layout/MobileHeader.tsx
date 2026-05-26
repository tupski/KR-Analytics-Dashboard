'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, Bot } from 'lucide-react';

const PAGE_LABELS: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/booking': 'Booking',
    '/kalender': 'Kalender',
    '/unit': 'Unit',
    '/customer': 'Customer',
    '/laporan': 'Laporan',
    '/analytics-ai': 'AI Chat',
    '/pengaturan': 'Pengaturan',
};

function getPageLabel(pathname: string): string {
    // Exact match first
    if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];

    // Prefix match (e.g. /analytics-ai/chat → 'AI Chat')
    for (const [key, label] of Object.entries(PAGE_LABELS)) {
        if (pathname.startsWith(`${key}/`)) return label;
    }

    return 'Kakarama Room';
}

interface MobileHeaderProps {
    onOpenSidebar: () => void;
}

export default function MobileHeader({ onOpenSidebar }: MobileHeaderProps) {
    const pathname = usePathname();
    const pageLabel = getPageLabel(pathname ?? '/');

    return (
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 py-2.5 px-4 flex items-center justify-between h-12">
            {/* Left: hamburger + page title */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onOpenSidebar}
                    aria-label="Open navigation menu"
                    className="p-1 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>
                <span className="text-sm font-semibold text-gray-900">{pageLabel}</span>
            </div>

            {/* Right: Krai AI chat button */}
            <Link
                href="/analytics-ai/chat"
                aria-label="Open Krai AI chat"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-sm font-medium"
            >
                <Bot className="w-4 h-4" />
                <span>Krai</span>
            </Link>
        </header>
    );
}
