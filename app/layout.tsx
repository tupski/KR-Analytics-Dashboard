import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import NavigationProgress from '@/components/layout/NavigationProgress';
import ErrorBoundary from '@/components/ErrorBoundary';
import { createServerClient } from '@/lib/supabase/server';
import ServerActionRecovery from '@/components/shared/ServerActionRecovery';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    let faviconUrl: string | null | undefined;

    try {
        const supabase = createServerClient();
        const { data } = await supabase
            .from('app_settings')
            .select('value, updated_at')
            .eq('key', 'favicon_url')
            .maybeSingle();

        if (data?.value) {
            const ts = data.updated_at
                ? new Date(data.updated_at).getTime().toString()
                : Date.now().toString();
            faviconUrl = `${data.value}?v=${ts}`;
        }
    } catch {
        // DB unavailable — skip favicon
    }

    return {
        title: 'Kakarama Room Analytics Dashboard',
        description: 'Analytics dashboard for Kakarama Room apartment rental',
        icons: faviconUrl
            ? {
                icon: faviconUrl,
                shortcut: faviconUrl,
                apple: faviconUrl,
            }
            : { icon: '/favicon.svg' },
    };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id">
            <body className={`${inter.className} min-h-dvh bg-background text-foreground antialiased`} suppressHydrationWarning>
                <NavigationProgress />
                <ServerActionRecovery />
                <ErrorBoundary>
                    {children}
                </ErrorBoundary>
                {/* Build version debug — client-side console log */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: [
                            "console.info('KR Dashboard Build:', {",
                            "  buildId: '" + (process.env.NEXT_PUBLIC_BUILD_ID || 'N/A') + "',",
                            "  gitSha: '" + (process.env.NEXT_PUBLIC_GIT_SHA || 'N/A') + "',",
                            "  buildTime: '" + (process.env.NEXT_PUBLIC_BUILD_TIME || 'N/A') + "',",
                            "});",
                        ].join('\n'),
                    }}
                />
            </body>
        </html>
    );
}
