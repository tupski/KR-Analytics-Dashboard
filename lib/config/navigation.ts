import {
    LayoutDashboard, Calendar, CalendarDays, Building, Users, Wallet, Brain, Settings,
    Receipt,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    isKrai?: boolean;
    mobileShow?: boolean; // whether to show in mobile bottom nav
}

export const NAV_ITEMS: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, mobileShow: true },
    { label: 'Booking', href: '/booking', icon: Calendar, mobileShow: true },
    { label: 'Kalender', href: '/kalender', icon: CalendarDays },
    { label: 'Unit', href: '/unit', icon: Building, mobileShow: true },
    { label: 'Customer', href: '/customer', icon: Users },
    { label: 'Laporan', href: '/laporan', icon: Wallet, mobileShow: true },
    { label: 'KR·AI Chat', href: '/chat', icon: Brain, isKrai: true },
    { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
];

/** Items shown in the main sidebar (currently all items) */
export const SIDEBAR_ITEMS = NAV_ITEMS;

/** Items shown in the mobile bottom navigation bar */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(item => item.mobileShow);

/** Standard isActive check for navigation links */
export function isActivePath(pathname: string | null, href: string): boolean {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
}
