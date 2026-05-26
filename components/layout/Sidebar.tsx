'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    Calendar,
    CalendarDays,
    Building,
    Users,
    Wallet,
    Brain,
    Settings,
    X,
} from 'lucide-react';

/**
 * Sidebar - Navigation Component (Desktop + Mobile Overlay)
 *
 * Desktop: fixed sidebar always visible (lg and above).
 * Mobile: slide-in overlay controlled by `isMobileOpen` / `onClose` props.
 */

interface SidebarProps {
    isMobileOpen?: boolean;
    onClose?: () => void;
}

export default function Sidebar({ isMobileOpen = false, onClose }: SidebarProps) {
    const pathname = usePathname();

    const menuItems = [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Booking', href: '/booking', icon: Calendar },
        { label: 'Kalender', href: '/kalender', icon: CalendarDays },
        { label: 'Unit', href: '/unit', icon: Building },
        { label: 'Customer', href: '/customer', icon: Users },
        { label: 'Laporan', href: '/laporan', icon: Wallet },
        { label: 'AI Chat', href: '/analytics-ai', icon: Brain },
        { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
    ];

    const isActive = (href: string) => {
        return pathname === href || pathname?.startsWith(`${href}/`);
    };

    // Shared sidebar panel content
    const sidebarPanel = (
        <>
            {/* Logo/Branding */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
                        <Building className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">Kakarama</h1>
                        <p className="text-xs text-gray-500">Room Analytics</p>
                    </div>
                </div>

                {/* Close button — mobile only */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close navigation menu"
                    className="lg:hidden p-1 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 px-3 py-4 overflow-y-auto">
                <ul className="space-y-1">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);

                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    onClick={onClose}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                                    <span>{item.label}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* User Profile Section */}
            <div className="px-3 py-4 border-t border-gray-200">
                <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <Users className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">Admin</p>
                        <p className="text-xs text-gray-500 truncate">admin@kakarama.com</p>
                    </div>
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* ── Desktop sidebar (always visible, lg+) ── */}
            <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 lg:border-r lg:border-blue-100 lg:bg-gradient-to-b lg:from-white lg:to-blue-50/50">
                {sidebarPanel}
            </aside>

            {/* ── Mobile overlay sidebar ── */}
            {/* Backdrop */}
            <div
                className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                aria-hidden={!isMobileOpen}
            >
                {/* Dark overlay */}
                <div
                    className="absolute inset-0 bg-black/40"
                    onClick={onClose}
                    aria-label="Close sidebar backdrop"
                />

                {/* Slide-in panel */}
                <aside
                    className={`absolute inset-y-0 left-0 w-64 flex flex-col bg-gradient-to-b from-white to-blue-50/50 border-r border-blue-100 shadow-xl transform transition-transform duration-300 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                        }`}
                >
                    {sidebarPanel}
                </aside>
            </div>
        </>
    );
}
