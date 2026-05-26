import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MobileNavController from '@/components/layout/MobileNavController';
import NavigationProgress from '@/components/layout/NavigationProgress';
import AIChatFloat from '@/components/ai/AIChatFloat';
import ScrollToTop from '@/components/ScrollToTop';
import ErrorBoundary from '@/components/ErrorBoundary';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Kakarama Room Analytics Dashboard',
    description: 'Comprehensive analytics dashboard for apartment rental management',
};

/**
 * RootLayout - Main Application Layout
 *
 * Provides the base layout structure with:
 * - Desktop: fixed sidebar (always visible)
 * - Mobile: sticky header with hamburger + slide-in sidebar overlay
 *
 */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="id">
            <body className={inter.className}>
                <NavigationProgress />
                <ErrorBoundary>
                    <div className="flex h-screen overflow-hidden">
                        {/* Sidebar (desktop fixed) + MobileHeader + mobile overlay sidebar */}
                        <MobileNavController />

                        {/* Main Content Area */}
                        <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
                            {/* Content — overflow-y-auto for normal scrolling pages.
                                Chat page uses flex-1 + overflow-hidden to fill this container. */}
                            <div className="flex-1 overflow-y-auto flex flex-col" data-scroll-container>
                                {children}
                            </div>
                        </div>
                    </div>

                    {/* AI Chat Floating Button */}
                    <AIChatFloat />
                    {/* Scroll to top */}
                    <ScrollToTop />
                </ErrorBoundary>
            </body>
        </html>
    );
}
