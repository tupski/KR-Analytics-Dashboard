import { Suspense } from 'react';
import { Settings, Palette, Image as ImageIcon, Type } from 'lucide-react';
import AppSettingsClient from '@/components/settings/AppSettingsClient';
import { fetchAppSettings } from './actions';

export const metadata = {
    title: 'Pengaturan - Kakarama Room Analytics',
    description: 'Pengaturan aplikasi dan konfigurasi',
};

export default async function PengaturanPage() {
    const settings = await fetchAppSettings();

    return (
        <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-xl flex items-center justify-center">
                    <Settings className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Pengaturan</h1>
                    <p className="text-sm text-gray-600">Kelola pengaturan aplikasi dan konfigurasi</p>
                </div>
            </div>

            {/* Settings Sections */}
            <div className="space-y-4">
                {/* App Settings */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                        <div className="flex items-center gap-2">
                            <Palette className="w-4 h-4 text-blue-600" />
                            <h2 className="font-semibold text-gray-900">Pengaturan Aplikasi</h2>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">Logo, nama aplikasi, dan tema warna</p>
                    </div>
                    <div className="p-5">
                        <Suspense fallback={<div className="text-sm text-gray-500">Memuat...</div>}>
                            <AppSettingsClient initialSettings={settings} />
                        </Suspense>
                    </div>
                </div>

                {/* AI Settings - Coming Soon */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-60">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-purple-600" />
                            <h2 className="font-semibold text-gray-900">Konfigurasi AI</h2>
                            <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Segera</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">Provider AI, model, dan API keys</p>
                    </div>
                    <div className="p-5">
                        <p className="text-sm text-gray-500">Fitur ini akan segera tersedia.</p>
                    </div>
                </div>

                {/* SMTP Settings - Coming Soon */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden opacity-60">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-white">
                        <div className="flex items-center gap-2">
                            <Type className="w-4 h-4 text-green-600" />
                            <h2 className="font-semibold text-gray-900">Konfigurasi SMTP</h2>
                            <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Segera</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">Email server untuk notifikasi</p>
                    </div>
                    <div className="p-5">
                        <p className="text-sm text-gray-500">Fitur ini akan segera tersedia.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
