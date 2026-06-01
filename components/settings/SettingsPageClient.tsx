'use client';

import { Suspense } from 'react';
import { Settings, Palette } from 'lucide-react';
import dynamic from 'next/dynamic';
import SettingsTabs, { useActiveTab } from './SettingsTabs';
import AppSettingsClient from './AppSettingsClient';
import type { AppSettings } from '@/app/(dashboard)/pengaturan/actions';

const AISettingsPage = dynamic(() => import('@/components/ai/AISettingsPage'), { ssr: false });

interface Props {
    initialSettings: AppSettings;
}

function Inner({ initialSettings }: Props) {
    const activeTab = useActiveTab();

    return (
        <div className="p-4 lg:p-6 space-y-6 max-w-6xl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-xl flex items-center justify-center">
                    <Settings className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Pengaturan</h1>
                    <p className="text-sm text-gray-600">Kelola pengaturan aplikasi dan konfigurasi AI</p>
                </div>
            </div>

            {/* Tabs */}
            <SettingsTabs />

            {/* Tab content */}
            <div className="space-y-6">
                {activeTab === 'umum' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                            <div className="flex items-center gap-2">
                                <Settings className="w-4 h-4 text-blue-600" />
                                <h2 className="font-semibold text-gray-900">Pengaturan Umum</h2>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">Nama aplikasi, logo, favicon, periode laporan, dan zona waktu</p>
                        </div>
                        <div className="p-5">
                            <AppSettingsClient initialSettings={initialSettings} mode="umum" />
                        </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <AISettingsPage section="ai" />
                )}

                {activeTab === 'insight' && (
                    <AISettingsPage section="insight" />
                )}

                {activeTab === 'tampilan' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                            <div className="flex items-center gap-2">
                                <Palette className="w-4 h-4 text-blue-600" />
                                <h2 className="font-semibold text-gray-900">Pengaturan Tampilan</h2>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">Tema, warna, sidebar, dan tampilan kompak</p>
                        </div>
                        <div className="p-5">
                            <AppSettingsClient initialSettings={initialSettings} mode="tampilan" />
                        </div>
                    </div>
                )}

                {activeTab === 'sistem' && (
                    <AISettingsPage section="sistem" />
                )}
            </div>
        </div>
    );
}

export default function SettingsPageClient(props: Props) {
    return (
        <Suspense fallback={<div className="p-4 lg:p-6 max-w-6xl"><div className="text-sm text-gray-500">Memuat...</div></div>}>
            <Inner {...props} />
        </Suspense>
    );
}
