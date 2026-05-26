import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import MobileNavController from '@/components/layout/MobileNavController';
import ContentWrapper from '@/components/layout/ContentWrapper';
import NavigationProgress from '@/components/layout/NavigationProgress';
import AIChatFloat from '@/components/ai/AIChatFloat';
import ScrollToTop from '@/components/ScrollToTop';
import ErrorBoundary from '@/components/ErrorBoundary';
import { getSession } from '@/lib/supabase/auth';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Kakarama Room Analytics Dashboard',
    description: 'Analytics dashboard for Kakarama Room apartment rental',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // Get session server-side to pass user info to layout components
    let userEmail: string | null = null;
    try {
        const session = await getSession();
        userEmail = session?.user?.email ?? null;
    } catch {
        // On login page, session doesn't exist yet — that's fine
    }

    return (
        <html lang="id">
            <body className={inter.className}>
                <NavigationProgress />
                <ErrorBoundary>
                    <div className="flex h-screen overflow-hidden">
                        <MobileNavController userEmail={userEmail} />
                        <ContentWrapper>
                            {children}
                        </ContentWrapper>
                    </div>

                    <AIChatFloat />
                    <ScrollToTop />
                </ErrorBoundary>
            </body>
        </html>
    );
}
