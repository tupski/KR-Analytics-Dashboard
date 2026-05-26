import { redirect } from 'next/navigation';

/**
 * /analytics-ai → redirect to the Krai chat page.
 * AI settings are in /pengaturan.
 */
export default function AnalyticsAIPage() {
    redirect('/analytics-ai/chat');
}
