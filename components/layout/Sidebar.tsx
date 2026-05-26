'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback } from 'react';
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
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

/**
 * Sidebar — Desktop & Tablet (lg+): collapsible fixed sidebar.
 * Mobile (<lg): slide-in overlay triggered by MobileNavController.
 */

interface SidebarProps {
    isMobileOpen?: boolean;
    onClose?: () => void;
}

const MENU_ITEMS = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Booking', href: '/booking', icon: Calendar },
    { label: 'Kalender', href: '/kalender', icon: CalendarDays },
    { label: 'Unit', href: '/unit', icon: Building },
    { label: 'Customer', href: '/customer', icon: Users },
    { label: 'Laporan', href: '/laporan', icon: Wallet },
    { label: 'AI Chat', href: '/analytics-ai', icon: Brain },
    { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
];

/** Persist desktop collapsed state across page navigations */
const COLLAPSED_KEY = 'kr-sidebar-collapsed';

function readCollapsed(): boolean {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

function writeCollapsed(v: boolean) {
    try { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch { }
}

export default function Sidebar({ isMobileOpen = false, onClose }: SidebarProps) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window !== 'undefined') return readCollapsed();
        return false;
    });

    const toggleCollapsed = useCallback(() => {
        setCollapsed(prev => {
            writeCollapsed(!prev);
            // Notify ContentWrapper in same tab
            window.dispatchEvent(new Event('kr-sidebar-toggle'));
            return !prev;
        });
    }, []);

    const isActive = (href: string) =>
        pathname === href || pathname?.startsWith(`${href}/`);

    // ── Content helpers ───────────────────────────────────────────────────────

    const NavItem = ({ item }: { item: typeof MENU_ITEMS[0] }) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
            <li>
                <Link
                    href={item.href}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center rounded-lg text-sm font-medium transition-colors ${collapsed
                        ? 'justify-center px-2 py-2.5'
                        : 'gap-3 px-3 py-2.5'
                        } ${active
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                    {!collapsed && <span>{item.label}</span>}
                </Link>
            </li>
        );
    };

    // ── Desktop sidebar ────────────────────────────────────────────────────────
    const desktopSidebar = (
        <aside
            className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-blue-100 lg:bg-gradient-to-b lg:from-white lg:to-blue-50/50 transition-all duration-200 ${collapsed ? 'lg:w-16' : 'lg:w-64'}`}
        >
            {/* Logo / Branding */}
            <div className={`flex items-center border-b border-gray-200 ${collapsed ? 'justify-center px-2 py-5' : 'gap-3 px-5 py-5'}`}>
                <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building className="w-5 h-5 text-white" />
                </div>
                {!collapsed && (
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-gray-900 leading-tight">Kakarama</h1>
                        <p className="text-xs text-gray-500">Room Analytics</p>
                    </div>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 px-2 py-4 overflow-y-auto">
                <ul className="space-y-0.5">
                    {MENU_ITEMS.map(item => <NavItem key={item.href} item={item} />)}
                </ul>
            </nav>

            {/* Footer: user + collapse toggle */}
            <div className={`border-t border-gray-200 py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
                {!collapsed && (
                    <div className="flex items-center gap-3 px-2 py-2 mb-1">
                        <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">Admin</p>
                            <p className="text-[11px] text-gray-500 truncate">admin@kakarama.com</p>
                        </div>
                    </div>
                )}

                {/* Collapse toggle button */}
                <button
                    onClick={toggleCollapsed}
                    title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
                    className={`flex items-center gap-2 w-full rounded-lg px-2 py-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors ${collapsed ? 'justify-center' : ''}`}
                >
                    {collapsed ? (
                        <ChevronRight className="w-4 h-4" />
                    ) : (
                        <>
                            <ChevronLeft className="w-4 h-4" />
                            <span>Ciutkan</span>
                        </>
                    )}
                </button>
            </div>
        </aside>
    );

    // ── Mobile overlay sidebar ────────────────────────────────────────────────
    const mobileSidebar = (
        <div
            className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            aria-hidden={!isMobileOpen}
        >
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <aside
                className={`absolute inset-y-0 left-0 w-64 flex flex-col bg-gradient-to-b from-white to-blue-50/50 border-r border-blue-100 shadow-xl transform transition-transform duration-300 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
                            <Building className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-gray-900 leading-tight">Kakarama</h1>
                            <p className="text-xs text-gray-500">Room Analytics</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup menu"
                        className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 overflow-y-auto">
                    <ul className="space-y-0.5">
                        {MENU_ITEMS.map(item => <NavItem key={item.href} item={item} />)}
                    </ul>
                </nav>

                {/* Profile */}
                <div className="px-3 py-3 border-t border-gray-200">
                    <div className="flex items-center gap-3 px-2 py-2">
                        <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">Admin</p>
                            <p className="text-[11px] text-gray-500 truncate">admin@kakarama.com</p>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    );

    return (
        <>
            {desktopSidebar}
            {mobileSidebar}
        </>
    );
}
