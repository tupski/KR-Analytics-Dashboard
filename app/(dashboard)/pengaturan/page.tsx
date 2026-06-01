import { Suspense } from 'react';
import SettingsPageClient from '@/components/settings/SettingsPageClient';
import { fetchAppSettings } from './actions';

export const metadata = {
    title: 'Pengaturan - Kakarama Room Analytics',
    description: 'Pengaturan aplikasi dan konfigurasi AI',
};

export default async function PengaturanPage() {
    const settings = await fetchAppSettings();

    return (
        <Suspense fallback={<div className="p-4 lg:p-6 max-w-6xl"><div className="text-sm text-gray-500">Memuat...</div></div>}>
            <SettingsPageClient initialSettings={settings} />
        </Suspense>
    );
}
