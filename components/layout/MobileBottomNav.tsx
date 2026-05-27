'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { MOBILE_NAV_ITEMS, isActivePath } from '@/lib/config/navigation';

/**
 * MobileBottomNav - Mobile Bottom Navigation Component
 *
 * Fixed bottom navigation bar for mobile devices.
 * Shows the most important navigation items with icons.
 * Hidden on desktop (lg breakpoint and above).
 *
 */
export default function MobileBottomNav() {
    const pathname = usePathname();

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
            <div className="flex items-center justify-around px-2 py-2">
                {MOBILE_NAV_ITEMS.map((item) => {
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
            </div>
        </nav>
    );
}
