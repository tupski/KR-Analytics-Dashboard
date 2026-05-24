import AISettingsPage from '@/components/ai/AISettingsPage';

/**
 * Analytics AI Page
 * 
 * Allows users to configure AI providers (OpenAI, Claude, DeepSeek, etc.)
 * with their own API keys for AI-powered analytics insights.
 */
export default function AnalyticsAIPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Analytics AI</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Konfigurasi AI provider untuk insight analitik cerdas
                </p>
            </div>
            <main className="px-4 sm:px-6 lg:px-8 py-6">
                <AISettingsPage />
            </main>
        </div>
    );
}
