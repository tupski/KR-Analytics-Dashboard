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
    FileText,
    Brain,
    Settings,
} from 'lucide-react';

/**
 * Sidebar - Desktop Navigation Component
 * 
 * Fixed sidebar navigation for desktop devices.
 * Highlights active menu item based on current route.
 * 
 * Features:
 * - Fixed position on left side (desktop only)
 * - Active route highlighting
 * - Smooth hover effects
 * - Logo/branding at top
 * - Hidden on mobile devices
 * 
 * Requirements: 6.1, 6.3, 6.5, 6.7, 9.2, 9.3
 */
export default function Sidebar() {
    const pathname = usePathname();

    const menuItems = [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Booking', href: '/booking', icon: Calendar },
        { label: 'Kalender', href: '/kalender', icon: CalendarDays },
        { label: 'Unit', href: '/unit', icon: Building },
        { label: 'Customer', href: '/customer', icon: Users },
        { label: 'Keuangan', href: '/keuangan', icon: Wallet },
        { label: 'Laporan', href: '/laporan', icon: FileText },
        { label: 'Analytics AI', href: '/analytics-ai', icon: Brain },
        { label: 'Pengaturan', href: '/pengaturan', icon: Settings },
    ];

    const isActive = (href: string) => {
        return pathname === href || pathname?.startsWith(`${href}/`);
    };

    return (
        <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 lg:border-r lg:border-gray-200 lg:bg-white">
            {/* Logo/Branding */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
                    <Building className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Kakarama</h1>
                    <p className="text-xs text-gray-500">Room Analytics</p>
                </div>
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

            {/* User Profile Section (Optional) */}
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
        </aside>
    );
}
