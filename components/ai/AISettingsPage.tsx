'use client';

import { useState, useEffect } from 'react';
import { Brain, Key, Server, Check, AlertCircle } from 'lucide-react';

interface AIProviderConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
}

const PROVIDERS = [
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4o, GPT-4o-mini, GPT-3.5',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-4o-mini',
        placeholder: 'sk-...',
    },
    {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        description: 'Claude Sonnet, Claude Haiku, Claude Opus',
        models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-3-5-sonnet-20241022'],
        defaultModel: 'claude-sonnet-4-20250514',
        placeholder: 'sk-ant-...',
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        description: 'DeepSeek Chat, DeepSeek Coder',
        models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
        defaultModel: 'deepseek-chat',
        placeholder: 'sk-...',
    },
    {
        id: 'openai-compatible',
        name: 'OpenAI Compatible',
        description: 'Groq, Together, Fireworks, Ollama, dll',
        models: [],
        defaultModel: '',
        placeholder: 'API key...',
        hasBaseUrl: true,
    },
];

const STORAGE_KEY = 'kr-ai-config';

export default function AISettingsPage() {
    const [config, setConfig] = useState<AIProviderConfig>({
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini',
        baseUrl: '',
    });
    const [saved, setSaved] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Load config from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setConfig(JSON.parse(stored));
            } catch { }
        }
    }, []);

    const selectedProvider = PROVIDERS.find(p => p.id === config.provider);

    const handleProviderChange = (providerId: string) => {
        const provider = PROVIDERS.find(p => p.id === providerId);
        setConfig({
            ...config,
            provider: providerId,
            model: provider?.defaultModel || '',
            baseUrl: '',
        });
        setTestResult(null);
    };

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Berikan ringkasan singkat performa bisnis hari ini dalam 2 kalimat.' }],
                    config,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setTestResult({ success: true, message: data.message });
            } else {
                setTestResult({ success: false, message: data.error || 'Gagal terhubung' });
            }
        } catch (error: any) {
            setTestResult({ success: false, message: error.message });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="max-w-3xl space-y-6">
            {/* Provider Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-blue-600" />
                    Pilih AI Provider
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PROVIDERS.map((provider) => (
                        <button
                            key={provider.id}
                            onClick={() => handleProviderChange(provider.id)}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${config.provider === provider.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <p className="font-medium text-gray-900">{provider.name}</p>
                            <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Key className="w-5 h-5 text-blue-600" />
                    Konfigurasi
                </h2>

                <div className="space-y-4">
                    {/* API Key */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            API Key
                        </label>
                        <input
                            type="password"
                            value={config.apiKey}
                            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                            placeholder={selectedProvider?.placeholder || 'API key...'}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            API key disimpan di browser (localStorage), tidak dikirim ke server kami.
                        </p>
                    </div>

                    {/* Model */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Model
                        </label>
                        {selectedProvider?.models && selectedProvider.models.length > 0 ? (
                            <select
                                value={config.model}
                                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                            >
                                {selectedProvider.models.map((model) => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={config.model}
                                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                                placeholder="Nama model (e.g. llama-3.1-70b)"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        )}
                    </div>

                    {/* Base URL (for OpenAI Compatible) */}
                    {(selectedProvider as any)?.hasBaseUrl && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Server className="w-4 h-4 inline mr-1" />
                                Base URL
                            </label>
                            <input
                                type="text"
                                value={config.baseUrl || ''}
                                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                                placeholder="https://api.groq.com/openai/v1/chat/completions"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-6">
                    <button
                        onClick={handleSave}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        {saved ? <Check className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                        {saved ? 'Tersimpan!' : 'Simpan'}
                    </button>

                    <button
                        onClick={handleTest}
                        disabled={!config.apiKey || testing}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {testing ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Brain className="w-4 h-4" />
                        )}
                        {testing ? 'Testing...' : 'Test Koneksi'}
                    </button>
                </div>

                {/* Test Result */}
                {testResult && (
                    <div className={`mt-4 p-4 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                        }`}>
                        <div className="flex items-start gap-2">
                            {testResult.success ? (
                                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            )}
                            <div>
                                <p className={`text-sm font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                    {testResult.success ? 'Berhasil terhubung!' : 'Gagal'}
                                </p>
                                <p className={`text-sm mt-1 ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                                    {testResult.message}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Cara Menggunakan</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Pilih AI provider yang ingin digunakan</li>
                    <li>Masukkan API key dari provider tersebut</li>
                    <li>Klik &ldquo;Simpan&rdquo; lalu &ldquo;Test Koneksi&rdquo;</li>
                    <li>Gunakan tombol chat AI (💬) di kanan bawah untuk bertanya tentang data bisnis</li>
                </ol>
            </div>
        </div>
    );
}
