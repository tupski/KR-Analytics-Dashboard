'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import {
    Building,
    Users,
    X,
    ChevronLeft,
    ChevronRight,
    LogOut,
} from 'lucide-react';
import KraiLogo from '@/components/shared/KraiLogo';
import { useAppSettings } from '@/lib/contexts/AppSettingsContext';
import { SIDEBAR_ITEMS, isActivePath } from '@/lib/config/navigation';

interface SidebarProps {
    isMobileOpen?: boolean;
    onClose?: () => void;
    userEmail?: string | null;
}

const COLLAPSED_KEY = 'kr-sidebar-collapsed';

function readCollapsed(): boolean {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean) {
    try { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch { }
}

function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
    const handleLogout = async () => {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    if (iconOnly) {
        return (
            <button
                onClick={handleLogout}
                title="Keluar"
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
                <LogOut className="w-4 h-4" />
            </button>
        );
    }

    return (
        <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
        >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
        </button>
    );
}

function MobileSidebarHeader({ onClose }: { onClose: () => void }) {
    const { settings } = useAppSettings();
    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2.5 min-w-0">
                {settings.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={settings.logo_url} alt={settings.app_name} className="w-8 h-8 object-contain flex-shrink-0 rounded" />
                ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building className="w-4 h-4 text-white" />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="text-sm font-bold text-gray-900 leading-tight truncate">{settings.app_name}</h1>
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
    );
}

/** Logo block used in desktop sidebar header */
function SidebarLogo({ collapsed }: { collapsed?: boolean }) {
    const { settings } = useAppSettings();

    if (settings.logo_url) {
        return (
            <div className={`border-b border-gray-200 ${collapsed ? 'flex justify-center py-3' : 'flex items-center gap-3 px-5 py-4'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={settings.logo_url}
                    alt={settings.app_name}
                    className={`object-contain ${collapsed ? 'w-10 h-10' : 'w-9 h-9'} flex-shrink-0`}
                />
                {!collapsed && (
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-gray-900 leading-tight truncate">{settings.app_name}</h1>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`border-b border-gray-200 ${collapsed ? 'flex justify-center py-4' : 'flex items-center gap-3 px-5 py-5'}`}>
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
                <div className="min-w-0">
                    <h1 className="text-base font-bold text-gray-900 leading-tight truncate">{settings.app_name}</h1>
                </div>
            )}
        </div>
    );
}

export default function Sidebar({ isMobileOpen = false, onClose, userEmail }: SidebarProps) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window !== 'undefined') return readCollapsed();
        return false;
    });

    const toggleCollapsed = useCallback(() => {
        setCollapsed(prev => {
            writeCollapsed(!prev);
            window.dispatchEvent(new Event('kr-sidebar-toggle'));
            return !prev;
        });
    }, []);

    // ── Desktop sidebar ────────────────────────────────────────────────────────
    const desktopSidebar = (
        <aside
            className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-blue-100 lg:bg-gradient-to-b lg:from-white lg:to-blue-50/50 transition-all duration-200 z-40 ${collapsed ? 'lg:w-16' : 'lg:w-64'}`}
        >
            <SidebarLogo collapsed={collapsed} />

            {/* Nav */}
            <nav className={`flex-1 overflow-y-auto py-3 ${collapsed ? 'px-2' : 'px-2'}`}>
                <ul className="space-y-1">
                    {SIDEBAR_ITEMS.map(item => {
                        const Icon = item.icon;
                        const active = isActivePath(pathname, item.href);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    title={collapsed ? item.label : undefined}
                                    className={`flex items-center rounded-lg text-sm font-medium transition-colors ${collapsed
                                        ? 'justify-center w-12 h-12 mx-auto'
                                        : 'gap-3 px-3 py-2.5'
                                        } ${active
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-700' : 'text-gray-500'}`} />
                                    {!collapsed && (
                                        (item as any).isKrai ? <KraiLogo size="sm" /> : <span>{item.label}</span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Footer: profile + collapse button (expanded mode only) */}
            {!collapsed && (
                <div className="border-t border-gray-200 p-3 space-y-2">
                    <div className="flex items-center gap-3 px-2 py-1.5 bg-gray-50 rounded-lg">
                        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">Super Admin</p>
                            <p className="text-[11px] text-gray-500 truncate">{userEmail || '—'}</p>
                        </div>
                        <LogoutButton iconOnly />
                    </div>
                    <button
                        onClick={toggleCollapsed}
                        title="Ciutkan sidebar"
                        className="flex items-center justify-center gap-1 w-full rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Ciutkan</span>
                    </button>
                </div>
            )}

            {/* Floating expand handle — only in collapsed mode, vertically centered on right edge */}
            {collapsed && (
                <button
                    onClick={toggleCollapsed}
                    title="Perluas sidebar"
                    className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 bg-white border border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 rounded-full shadow-md flex items-center justify-center text-gray-500 transition-colors z-50"
                    aria-label="Perluas sidebar"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
            )}
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
                className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col bg-gradient-to-b from-white to-blue-50/50 border-r border-blue-100 shadow-xl transform transition-transform duration-300 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <MobileSidebarHeader onClose={onClose!} />

                <nav className="flex-1 px-3 py-3 overflow-y-auto">
                    <ul className="space-y-1">
                        {SIDEBAR_ITEMS.map(item => {
                            const Icon = item.icon;
                            const active = isActivePath(pathname, item.href);
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        onClick={onClose}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
                                    >
                                        <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-700' : 'text-gray-500'}`} />
                                        <span>{item.label}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="px-3 py-3 border-t border-gray-200">
                    <div className="flex items-center gap-3 px-2 py-1.5 bg-gray-50 rounded-lg">
                        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">Super Admin</p>
                            <p className="text-[11px] text-gray-500 truncate">{userEmail || '—'}</p>
                        </div>
                        <LogoutButton iconOnly />
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
