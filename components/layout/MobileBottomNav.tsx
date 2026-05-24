'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    Calendar,
    Building,
    Users,
    Settings,
} from 'lucide-react';

/**
 * MobileBottomNav - Mobile Bottom Navigation Component
 * 
 * Fixed bottom navigation bar for mobile devices.
 * Shows the most important navigation items with icons.
 * Hidden on desktop (lg breakpoint and above).
 * 
 * Requirements: 6.2, 6.4, 6.6, 9.2
 */
export default function MobileBottomNav() {
    const pathname = usePathname();

    const menuItems = [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Booking', href: '/booking', icon: Calendar },
        { label: 'Unit', href: '/unit', icon: Building },
        { label: 'Customer', href: '/customer', icon: Users },
        { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
    ];

    const isActive = (href: string) => {
        return pathname === href || pathname?.startsWith(`${href}/`);
    };

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
            <div className="flex items-center justify-around px-2 py-2">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

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
