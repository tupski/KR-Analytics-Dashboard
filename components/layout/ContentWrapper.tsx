'use client';

import { useEffect, useState } from 'react';

const COLLAPSED_KEY = 'kr-sidebar-collapsed';

/**
 * ContentWrapper — adjusts left margin based on sidebar collapsed state.
 * Syncs with the sidebar's localStorage key.
 */
export default function ContentWrapper({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(COLLAPSED_KEY) === '1';
        }
        return false;
    });

    useEffect(() => {
        // Listen to storage events from the same tab (sidebar toggle uses localStorage)
        const handleStorage = () => {
            setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
        };

        // Poll — storage event only fires cross-tab; sidebar writes directly so we need a custom event
        const handleCustom = () => {
            setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
        };

        window.addEventListener('storage', handleStorage);
        window.addEventListener('kr-sidebar-toggle', handleCustom);
        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('kr-sidebar-toggle', handleCustom);
        };
    }, []);

    return (
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-200 ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
            {children}
        </div>
    );
}
