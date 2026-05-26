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
    '/chat': 'AI Chat',
    '/pengaturan': 'Pengaturan',
};

function getPageLabel(pathname: string): string {
    if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
    for (const [key, label] of Object.entries(PAGE_LABELS)) {
        if (pathname.startsWith(`${key}/`)) return label;
    }
    return 'Kakarama Room';
}

/**
 * MobileHeader — sticky top bar only on mobile (lg:hidden).
 * Lives inside ContentWrapper so it correctly stacks above page content.
 * Triggers the mobile sidebar via a global handler set by MobileNavController.
 */
export default function MobileHeader() {
    const pathname = usePathname();
    const pageLabel = getPageLabel(pathname ?? '/');

    const handleOpenSidebar = () => {
        if (typeof window !== 'undefined' && typeof (window as any).__krOpenMobileSidebar === 'function') {
            (window as any).__krOpenMobileSidebar();
        }
    };

    return (
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between h-12 px-3 shadow-sm flex-shrink-0">
            {/* Left: hamburger + page title */}
            <div className="flex items-center gap-2 min-w-0">
                <button
                    type="button"
                    onClick={handleOpenSidebar}
                    aria-label="Buka menu navigasi"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
                >
                    <Menu className="w-5 h-5" />
                </button>
                <span className="text-sm font-semibold text-gray-900 truncate">{pageLabel}</span>
            </div>

            {/* Right: KR·AI button */}
            <Link
                href="/chat"
                aria-label="Buka KR·AI chat"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-xs font-semibold flex-shrink-0 ml-2"
            >
                <Bot className="w-3.5 h-3.5 flex-shrink-0" />
                <span>KR·AI</span>
            </Link>
        </header>
    );
}
