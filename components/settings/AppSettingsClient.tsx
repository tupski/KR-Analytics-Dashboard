'use client';

import { useState, useRef } from 'react';
import { Save, Upload, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { updateAppSettings, uploadToCatbox, type AppSettings } from '@/app/(dashboard)/pengaturan/actions';

interface Props {
    initialSettings: AppSettings;
}

export default function AppSettingsClient({ initialSettings }: Props) {
    const [settings, setSettings] = useState(initialSettings);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingFavicon, setUploadingFavicon] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const logoInputRef = useRef<HTMLInputElement>(null);
    const faviconInputRef = useRef<HTMLInputElement>(null);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'File harus berupa gambar' });
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'Ukuran file maksimal 5MB' });
            return;
        }

        setUploadingLogo(true);
        setMessage(null);

        try {
            // Upload to Catbox
            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('fileToUpload', file);

            const response = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload gagal');
            }

            const url = await response.text();

            if (!url || !url.startsWith('https://files.catbox.moe/')) {
                throw new Error('Response tidak valid dari Catbox');
            }

            setSettings(prev => ({ ...prev, logo_url: url.trim() }));
            setMessage({ type: 'success', text: 'Logo berhasil diupload' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Gagal upload logo' });
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'File harus berupa gambar' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setMessage({ type: 'error', text: 'Ukuran file maksimal 2MB' });
            return;
        }

        setUploadingFavicon(true);
        setMessage(null);

        try {
            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('fileToUpload', file);

            const response = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload gagal');
            }

            const url = await response.text();

            if (!url || !url.startsWith('https://files.catbox.moe/')) {
                throw new Error('Response tidak valid dari Catbox');
            }

            setSettings(prev => ({ ...prev, favicon_url: url.trim() }));
            setMessage({ type: 'success', text: 'Favicon berhasil diupload' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Gagal upload favicon' });
        } finally {
            setUploadingFavicon(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const result = await updateAppSettings(settings);

            if (result.success) {
                setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan' });
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(result.error || 'Gagal menyimpan');
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Gagal menyimpan pengaturan' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Message */}
            {message && (
                <div
                    className={`flex items-start gap-2 p-3 rounded-lg border ${message.type === 'success'
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                >
                    {message.type === 'success' ? (
                        <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    ) : (
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm">{message.text}</p>
                </div>
            )}

            {/* App Name */}
            <div>
                <label htmlFor="app_name" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nama Aplikasi
                </label>
                <input
                    id="app_name"
                    type="text"
                    value={settings.app_name}
                    onChange={(e) => setSettings(prev => ({ ...prev, app_name: e.target.value }))}
                    placeholder="Kakarama Room Analytics"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Nama ini akan ditampilkan di sidebar dan header</p>
            </div>

            {/* Logo */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo Aplikasi</label>
                <div className="flex items-start gap-3">
                    {settings.logo_url && (
                        <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={settings.logo_url}
                                alt="Logo"
                                className="w-20 h-20 object-contain border border-gray-200 rounded-lg bg-white"
                            />
                            <button
                                onClick={() => setSettings(prev => ({ ...prev, logo_url: null }))}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                    <div className="flex-1">
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => logoInputRef.current?.click()}
                            disabled={uploadingLogo}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            {uploadingLogo ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Uploading...</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    <span>Upload Logo</span>
                                </>
                            )}
                        </button>
                        <p className="text-xs text-gray-500 mt-1">PNG, JPG, atau SVG. Maksimal 5MB.</p>
                    </div>
                </div>
            </div>

            {/* Favicon */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Favicon</label>
                <div className="flex items-start gap-3">
                    {settings.favicon_url && (
                        <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={settings.favicon_url}
                                alt="Favicon"
                                className="w-12 h-12 object-contain border border-gray-200 rounded-lg bg-white"
                            />
                            <button
                                onClick={() => setSettings(prev => ({ ...prev, favicon_url: null }))}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                    <div className="flex-1">
                        <input
                            ref={faviconInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFaviconUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => faviconInputRef.current?.click()}
                            disabled={uploadingFavicon}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            {uploadingFavicon ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Uploading...</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    <span>Upload Favicon</span>
                                </>
                            )}
                        </button>
                        <p className="text-xs text-gray-500 mt-1">ICO, PNG 32x32 atau 16x16. Maksimal 2MB.</p>
                    </div>
                </div>
            </div>

            {/* Primary Color */}
            <div>
                <label htmlFor="primary_color" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Warna Tema Utama
                </label>
                <div className="flex items-center gap-3">
                    <input
                        id="primary_color"
                        type="color"
                        value={settings.primary_color}
                        onChange={(e) => setSettings(prev => ({ ...prev, primary_color: e.target.value }))}
                        className="w-16 h-10 border border-gray-300 rounded-lg cursor-pointer"
                    />
                    <input
                        type="text"
                        value={settings.primary_color}
                        onChange={(e) => setSettings(prev => ({ ...prev, primary_color: e.target.value }))}
                        placeholder="#2563eb"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                    />
                </div>
                <p className="text-xs text-gray-500 mt-1">Warna ini akan digunakan untuk tombol, link, dan elemen UI utama</p>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-gray-200">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                    {saving ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Menyimpan...</span>
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4" />
                            <span>Simpan Pengaturan</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
