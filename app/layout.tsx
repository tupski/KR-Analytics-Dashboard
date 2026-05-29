import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import NavigationProgress from '@/components/layout/NavigationProgress';
import ErrorBoundary from '@/components/ErrorBoundary';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Kakarama Room Analytics Dashboard',
    description: 'Analytics dashboard for Kakarama Room apartment rental',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id">
            <body className={inter.className} suppressHydrationWarning>
                <NavigationProgress />
                <ErrorBoundary>
                    {children}
                </ErrorBoundary>
            </body>
        </html>
    );
}
