import AIInsightCard from '@/components/ai/AIInsightCard';
import AISettingsPage from '@/components/ai/AISettingsPage';
import { Settings } from 'lucide-react';

export default function PengaturanPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pengaturan</h1>
                <p className="mt-1 text-sm text-gray-500">Konfigurasi aplikasi dan integrasi AI</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* AI Settings */}
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-gray-600" />
                        Konfigurasi AI
                    </h2>
                    <AISettingsPage />
                </div>
            </main>
        </div>
    );
}
