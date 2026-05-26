'use client';

import { useEffect, useState } from 'react';
import MobileHeader from './MobileHeader';

const COLLAPSED_KEY = 'kr-sidebar-collapsed';

/**
 * ContentWrapper
 *
 * - Adjusts left margin to match sidebar width (collapsed vs expanded)
 * - Renders MobileHeader at the top so it stacks correctly above page content
 *   (this fixes the mobile layout where content appeared to the right of an
 *   invisible gap because MobileHeader was a sibling of the content div)
 */
export default function ContentWrapper({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(COLLAPSED_KEY) === '1';
        }
        return false;
    });

    useEffect(() => {
        const sync = () => {
            setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
        };
        window.addEventListener('storage', sync);
        window.addEventListener('kr-sidebar-toggle', sync);
        return () => {
            window.removeEventListener('storage', sync);
            window.removeEventListener('kr-sidebar-toggle', sync);
        };
    }, []);

    return (
        <div
            className={`flex-1 flex flex-col overflow-hidden transition-all duration-200 ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}
        >
            {/* Mobile sticky header — placed here so it's inside the flex column */}
            <MobileHeader />

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto flex flex-col" data-scroll-container>
                {children}
            </div>
        </div>
    );
}
