'use client';

import { useState, useEffect } from 'react';
import { Brain, Key, Server, Check, AlertCircle, DollarSign } from 'lucide-react';

interface AIProviderConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
}

interface ModelInfo {
    id: string;
    label: string;
    /** USD per 1M input tokens (indicative; actual provider pricing may change) */
    inputPrice: number;
    /** USD per 1M output tokens */
    outputPrice: number;
    notes?: string;
}

interface ProviderInfo {
    id: string;
    name: string;
    description: string;
    models: ModelInfo[];
    placeholder: string;
    hasBaseUrl?: boolean;
}

/**
 * Pricing indicator. Sorted cheap → expensive within each provider.
 * Prices are USD per 1 million tokens (approximate, indicative only).
 */
const PROVIDERS: ProviderInfo[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        description: 'Model paling murah, performa baik untuk analitik',
        placeholder: 'sk-...',
        models: [
            { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)', inputPrice: 0.27, outputPrice: 1.10 },
            { id: 'deepseek-coder', label: 'DeepSeek Coder', inputPrice: 0.27, outputPrice: 1.10 },
            { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', inputPrice: 0.55, outputPrice: 2.19, notes: 'Reasoning step-by-step' },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4o, o1, GPT-3.5 series',
        placeholder: 'sk-...',
        models: [
            { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPrice: 0.15, outputPrice: 0.60 },
            { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', inputPrice: 0.50, outputPrice: 1.50 },
            { id: 'o1-mini', label: 'o1-mini', inputPrice: 1.10, outputPrice: 4.40, notes: 'Reasoning' },
            { id: 'gpt-4o', label: 'GPT-4o', inputPrice: 2.50, outputPrice: 10.00 },
            { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', inputPrice: 10.00, outputPrice: 30.00 },
            { id: 'o1', label: 'o1', inputPrice: 15.00, outputPrice: 60.00, notes: 'Reasoning lanjutan' },
        ],
    },
    {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        description: 'Claude Haiku / Sonnet / Opus',
        placeholder: 'sk-ant-...',
        models: [
            { id: 'claude-haiku-4-20250514', label: 'Claude Haiku 4', inputPrice: 0.25, outputPrice: 1.25 },
            { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', inputPrice: 0.80, outputPrice: 4.00 },
            { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', inputPrice: 3.00, outputPrice: 15.00 },
            { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', inputPrice: 3.00, outputPrice: 15.00 },
            { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', inputPrice: 15.00, outputPrice: 75.00 },
        ],
    },
    {
        id: 'openai-compatible',
        name: 'OpenAI Compatible',
        description: 'Groq, Together, Fireworks, Ollama, OpenRouter, dll',
        placeholder: 'API key...',
        models: [],
        hasBaseUrl: true,
    },
];

const STORAGE_KEY = 'kr-ai-config';

const priceTier = (input: number) => {
    if (input < 0.50) return { label: 'Murah', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (input < 2) return { label: 'Hemat', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (input < 10) return { label: 'Standar', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'Premium', cls: 'bg-rose-100 text-rose-700 border-rose-200' };
};

const fmtPrice = (v: number) => `$${v.toFixed(2)}`;

export default function AISettingsPage() {
    const [config, setConfig] = useState<AIProviderConfig>({
        provider: 'deepseek',
        apiKey: '',
        model: 'deepseek-chat',
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
    const selectedModel = selectedProvider?.models.find(m => m.id === config.model);

    const handleProviderChange = (providerId: string) => {
        const provider = PROVIDERS.find(p => p.id === providerId);
        const defaultModel = provider?.models[0]?.id || '';
        setConfig({
            ...config,
            provider: providerId,
            model: defaultModel,
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
                    config: {
                        ...config,
                        provider: config.provider === 'custom' ? 'openai-compatible' : config.provider,
                    },
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
                            <span className="ml-2 text-xs text-gray-500 font-normal">(diurutkan dari paling murah)</span>
                        </label>
                        {selectedProvider && selectedProvider.models.length > 0 ? (
                            <>
                                <select
                                    value={config.model}
                                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                                >
                                    {selectedProvider.models.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.label} — {fmtPrice(m.inputPrice)} in / {fmtPrice(m.outputPrice)} out per 1M tokens
                                        </option>
                                    ))}
                                </select>

                                {/* Selected model details */}
                                {selectedModel && (
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                        {(() => {
                                            const tier = priceTier(selectedModel.inputPrice);
                                            return (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${tier.cls}`}>
                                                    <DollarSign className="w-3 h-3" />
                                                    {tier.label}
                                                </span>
                                            );
                                        })()}
                                        <span className="text-gray-500">
                                            Input {fmtPrice(selectedModel.inputPrice)}/1M · Output {fmtPrice(selectedModel.outputPrice)}/1M
                                        </span>
                                        {selectedModel.notes && <span className="text-gray-400">· {selectedModel.notes}</span>}
                                    </div>
                                )}
                            </>
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
                    {selectedProvider?.hasBaseUrl && (
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

            {/* Pricing reference table — full sorted */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    Harga Indikatif (Cheap → Expensive)
                </h2>
                <p className="text-xs text-gray-500 mb-3">USD per 1 juta token. Harga berubah-ubah, cek website provider untuk angka resmi.</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">Provider</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">Model</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-700">Input/1M</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-700">Output/1M</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700">Tier</th>
                            </tr>
                        </thead>
                        <tbody>
                            {PROVIDERS.flatMap(p =>
                                p.models.map(m => ({ ...m, providerName: p.name, providerId: p.id }))
                            ).sort((a, b) => a.inputPrice - b.inputPrice).map(m => {
                                const tier = priceTier(m.inputPrice);
                                return (
                                    <tr key={`${m.providerId}-${m.id}`} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-gray-700">{m.providerName}</td>
                                        <td className="px-3 py-2 text-gray-900">{m.label}{m.notes && <span className="text-gray-400 ml-1">· {m.notes}</span>}</td>
                                        <td className="px-3 py-2 text-right text-gray-900">{fmtPrice(m.inputPrice)}</td>
                                        <td className="px-3 py-2 text-right text-gray-700">{fmtPrice(m.outputPrice)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${tier.cls}`}>
                                                {tier.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Cara Menggunakan</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Pilih AI provider yang ingin digunakan</li>
                    <li>Masukkan API key dari provider tersebut</li>
                    <li>Klik &ldquo;Simpan&rdquo; lalu &ldquo;Test Koneksi&rdquo;</li>
                    <li>Gunakan tombol chat AI di kanan bawah untuk bertanya tentang data bisnis</li>
                    <li>AI sekarang bisa membandingkan periode — gunakan tombol &ldquo;Bandingkan vs Periode Sebelumnya&rdquo; di card insight atau chat</li>
                </ol>
            </div>
        </div>
    );
}
