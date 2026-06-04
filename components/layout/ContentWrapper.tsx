'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import MobileHeader from './MobileHeader';

const COLLAPSED_KEY = 'kr-sidebar-collapsed';

/**
 * ContentWrapper
 *
 * - Adjusts left margin to match sidebar width (collapsed vs expanded)
 * - Renders MobileHeader at the top so it stacks correctly above page content
 *   (this fixes the mobile layout where content appeared to the right of an
 *   invisible gap because MobileHeader was a sibling of the content div)
 * - On chat routes (/chat/**), disables parent scroll so the chat layout's
 *   internal flex/overflow handles scrolling — required for sticky sidebar,
 *   header, and input bar to work correctly.
 */
export default function ContentWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(COLLAPSED_KEY) === '1';
        }
        return false;
    });

    // Chat routes: disable parent scroll so chat layout handles its own
    const isChatRoute = pathname?.startsWith('/chat');

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
            className={`flex-1 flex flex-col transition-all duration-200 ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}
        >
            {/* Mobile sticky header — placed here so it's inside the flex column */}
            <MobileHeader />

            {/*
              On chat routes: overflow-hidden so the chat layout's internal
              flex/overflow-y controls scrolling (sticky works).
              On all other routes: overflow-y-auto as usual.
            */}
            <div
                className={`flex-1 flex flex-col ${isChatRoute ? 'overflow-hidden' : 'overflow-y-auto pb-16 lg:pb-0'}`}
                data-scroll-container
            >
                {children}
            </div>
        </div>
    );
}
