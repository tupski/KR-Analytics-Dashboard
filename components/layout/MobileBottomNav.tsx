'use client';

import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { NAV_ITEMS, isActivePath } from '@/lib/config/navigation';

/**
 * MobileBottomNav - Mobile Bottom Navigation Component
 *
 * Fixed bottom navigation bar for mobile devices.
 * Shows 4 core items + a "More" button that opens a drawer
 * with the remaining navigation items.
 * Hidden on desktop (lg breakpoint and above).
 *
 * Drawer state persists across navigation using URL search params.
 */
export default function MobileBottomNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Sync drawer state with URL search params on mount and when params change
    useEffect(() => {
        const drawerParam = searchParams.get('drawer');
        setDrawerOpen(drawerParam === 'open');
    }, [searchParams]);

    // Update URL when drawer state changes
    const toggleDrawer = (open: boolean) => {
        setDrawerOpen(open);
        const current = new URLSearchParams(Array.from(searchParams.entries()));
        if (open) {
            current.set('drawer', 'open');
        } else {
            current.delete('drawer');
        }
        const search = current.toString();
        const query = search ? `?${search}` : '';
        router.replace(`${pathname}${query}`, { scroll: false });
    };

    // Core items: first 4 items with mobileShow=true
    // Currently: Dashboard, Booking, Unit, Laporan
    const coreItems = NAV_ITEMS.filter(item => item.mobileShow).slice(0, 4);
    // Remaining items go in the More drawer
    const drawerItems = NAV_ITEMS.filter(item => !item.mobileShow);

    return (
        <>
            {/* Bottom nav bar — safe-area padding for modern phones */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <div className="flex items-center justify-around px-2 py-2">
                    {coreItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActivePath(pathname, item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active
                                    ? 'text-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}

                    {/* More button */}
                    <button
                        onClick={() => toggleDrawer(true)}
                        className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${drawerOpen
                            ? 'text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <MoreHorizontal className={`w-5 h-5 ${drawerOpen ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span>More</span>
                    </button>
                </div>
            </nav>

            {/* Backdrop */}
            <div
                className={`lg:hidden fixed inset-0 bg-black/40 z-[60] transition-opacity duration-200 ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                onClick={() => setDrawerOpen(false)}
            />

            {/* Drawer panel */}
            <div
                className={`lg:hidden fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-xl transform transition-transform duration-300 ${drawerOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
                style={{ maxHeight: '70vh' }}
            >
                {/* Handle + close */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-900">Menu</span>
                    <button
                        onClick={() => setDrawerOpen(false)}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        aria-label="Tutup menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Items grid */}
                <div className="overflow-y-auto py-2 px-3" style={{ maxHeight: 'calc(70vh - 52px)' }}>
                    <div className="grid grid-cols-3 gap-2">
                        {drawerItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActivePath(pathname, item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => toggleDrawer(false)}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors ${active
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon className={`w-6 h-6 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                                    <span className="text-center leading-tight">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}
