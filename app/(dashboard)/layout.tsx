import { AppSettingsProvider } from '@/lib/contexts/AppSettingsContext';
import MobileNavController from '@/components/layout/MobileNavController';
import ContentWrapper from '@/components/layout/ContentWrapper';
import AIChatFloat from '@/components/ai/AIChatFloat';
import ScrollToTop from '@/components/ScrollToTop';
import { getSession } from '@/lib/supabase/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    let userEmail: string | null = null;
    try {
        const session = await getSession();
        userEmail = session?.user?.email ?? null;
    } catch {
        userEmail = null;
    }

    return (
        <AppSettingsProvider>
            <div className="flex min-h-dvh bg-gray-50">
                <MobileNavController userEmail={userEmail} />
                <ContentWrapper>
                    {children}
                </ContentWrapper>
            </div>
            <AIChatFloat />
            <ScrollToTop />
        </AppSettingsProvider>
    );
}
