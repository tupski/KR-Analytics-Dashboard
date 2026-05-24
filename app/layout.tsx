import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Sidebar from '@/components/layout/Sidebar';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import NavigationProgress from '@/components/layout/NavigationProgress';
import AIChatFloat from '@/components/ai/AIChatFloat';
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
 * Provides the base layout structure with sidebar navigation (desktop)
 * and bottom navigation (mobile).
 * 
 * Features:
 * - Responsive layout with sidebar and mobile navigation
 * - Inter font family
 * - Consistent spacing and structure
 * - Error boundary for graceful error handling
 * 
 * Requirements: 6.1, 6.2, 9.1, 9.2, 7.8, 8.3
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
                        {/* Desktop Sidebar */}
                        <Sidebar />

                        {/* Main Content Area */}
                        <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto pb-16 lg:pb-0">
                                {children}
                            </div>

                            {/* Mobile Bottom Navigation */}
                            <MobileBottomNav />
                        </div>
                    </div>

                    {/* AI Chat Floating Button */}
                    <AIChatFloat />
                </ErrorBoundary>
            </body>
        </html>
    );
}
