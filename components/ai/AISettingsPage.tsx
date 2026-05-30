'use client';

import { useState, useEffect } from 'react';
import { Brain, Key, Server, Check, AlertCircle, ExternalLink, Eye, Lightbulb, Wrench, Zap, DollarSign, Trash2, Clock, Plus, Copy, Cloud, CloudOff, Download, Upload, Pencil } from 'lucide-react';
import { PROVIDERS, priceTier, allModelsSorted, type ProviderId, type ModelInfo } from '@/lib/ai/models';
import {
    loadConfigFromDb,
    saveProviderConfigToDb,
    deleteProviderConfigFromDb,
    setActiveProviderInDb,
    migrateLocalStorageToDb,
    type MultiAIConfig,
    type ProviderConfig,
} from '@/lib/ai/configClient';
import { addCustomModel, getCustomModels } from '@/lib/ai/config';
import { saveAIConfig, loadAIConfig } from '@/app/(dashboard)/pengaturan/ai-actions';

const fmtPrice = (v: number) => v === 0 ? 'Gratis' : `$${v.toFixed(2)}`;

/** Sanitize input to remove non-ASCII characters that cause ByteString errors */
function sanitizeInput(text: string): string {
    return text.replace(/[^\x20-\x7E]/g, '').trim();
}

/** Detect if value looks like a masked key (PART 6) */
function isMaskedApiKey(value: string): boolean {
    return (
        value.includes('***') ||
        value.includes('••') ||
        value.includes('...')
    );
}

/** Capability badges for a model */
function CapabilityBadges({ caps, size = 'sm' }: { caps: ModelInfo['capabilities']; size?: 'xs' | 'sm' }) {
    const sz = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';
    const txt = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
    const items: { icon: React.ReactNode; label: string; cls: string }[] = [];
    if (caps.vision) items.push({ icon: <Eye className={sz} />, label: 'Vision', cls: 'bg-purple-100 text-purple-700' });
    if (caps.reasoning) items.push({ icon: <Lightbulb className={sz} />, label: 'Reasoning', cls: 'bg-amber-100 text-amber-700' });
    if (caps.tools) items.push({ icon: <Wrench className={sz} />, label: 'Tools', cls: 'bg-blue-100 text-blue-700' });
    if (caps.fast) items.push({ icon: <Zap className={sz} />, label: 'Cepat', cls: 'bg-emerald-100 text-emerald-700' });
    return (
        <div className="flex flex-wrap gap-1">
            {items.map((b, i) => (
                <span key={i} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${txt} font-medium ${b.cls}`} title={b.label}>
                    {b.icon}
                    <span className="hidden sm:inline">{b.label}</span>
                </span>
            ))}
        </div>
    );
}

export default function AISettingsPage() {
    const [config, setConfig] = useState<MultiAIConfig | null>(null);
    const [activeProviderId, setActiveProviderId] = useState<ProviderId>('deepseek');

    // PART 8: New state for secure UX
    const [apiKeySet, setApiKeySet] = useState(false);
    const [apiKeyPreview, setApiKeyPreview] = useState('');
    const [isEditingApiKey, setIsEditingApiKey] = useState(false);
    const [draftApiKey, setDraftApiKey] = useState('');

    // Model & URL state (always editable)
    const [draftModel, setDraftModel] = useState('');
    const [draftBaseUrl, setDraftBaseUrl] = useState('');

    const [saved, setSaved] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    // Custom model
    const [customModelName, setCustomModelName] = useState('');
    const [testingCustom, setTestingCustom] = useState(false);
    // Cloud sync
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    // Retention settings
    const [retentionDays, setRetentionDays] = useState(30);
    const [retentionSaved, setRetentionSaved] = useState(false);
    const [pruning, setPruning] = useState(false);
    const [pruneResult, setPruneResult] = useState<string | null>(null);

    useEffect(() => {
        async function loadData() {
            // Run migration first
            const migration = await migrateLocalStorageToDb();
            if (migration.migrated > 0) {
                // Migration successful
            }

            // Load safe config from database (no full API keys)
            const cfg = await loadConfigFromDb();
            setConfig(cfg);

            // Set first configured provider as active
            if (cfg.providers.length > 0) {
                const first = cfg.providers[0];
                setActiveProviderId(first.providerId);
                setDraftModel(first.model);

                // PART 4: Set preview UX state — do NOT load full key into draftApiKey
                setApiKeySet(first.apiKeySet);
                setApiKeyPreview(first.apiKeyPreview || '');
                setIsEditingApiKey(false);
                setDraftApiKey('');
                setDraftBaseUrl(first.baseUrl || '');
            }

            // Load retention days from Supabase
            fetch('/api/krai/history?action=settings')
                .then(r => r.json())
                .then(data => { if (data.retentionDays) setRetentionDays(data.retentionDays); })
                .catch(() => { });
        }

        loadData();
    }, []);

    const handleSaveRetention = async () => {
        await fetch('/api/krai/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_settings', retentionDays }),
        });
        setRetentionSaved(true);
        setTimeout(() => setRetentionSaved(false), 2000);
    };

    const handlePruneNow = async () => {
        setPruning(true);
        setPruneResult(null);
        try {
            const res = await fetch('/api/krai/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'prune' }),
            });
            const data = await res.json();
            setPruneResult(`${data.deleted ?? 0} percakapan lama dihapus.`);
        } catch {
            setPruneResult('Gagal menjalankan pembersihan.');
        } finally {
            setPruning(false);
        }
    };

    if (!config) return null;

    const provider = PROVIDERS.find(p => p.id === activeProviderId);
    if (!provider) return null;

    // Merge provider models with custom models
    const customModels = getCustomModels(activeProviderId);
    const allModels = [...provider.models, ...customModels];

    const selectedModel = allModels.find(m => m.id === draftModel);

    const handleProviderTab = (id: ProviderId) => {
        setActiveProviderId(id);
        setTestResult(null);
        setSaved(null);
        setSaveError(null);

        const c = config.providers.find(p => p.providerId === id);
        if (c) {
            // PART 4: Load preview state — NOT full key
            setApiKeySet(c.apiKeySet);
            setApiKeyPreview(c.apiKeyPreview || '');
            setIsEditingApiKey(false);
            setDraftApiKey('');
            setDraftModel(c.model || PROVIDERS.find(p => p.id === id)?.models[0]?.id || '');
            setDraftBaseUrl(c.baseUrl || '');
        } else {
            // New provider (not yet configured)
            setApiKeySet(false);
            setApiKeyPreview('');
            setIsEditingApiKey(true); // FIX 1: new providers start in editing mode so user can type key
            setDraftApiKey('');
            setDraftModel(PROVIDERS.find(p => p.id === id)?.models[0]?.id || '');
            setDraftBaseUrl('');
        }
    };

    const handleSave = async () => {
        setSaveError(null);

        // FIX 2: Send apiKey if user typed anything, regardless of editing mode
        const shouldSendKey = !!draftApiKey.trim();

        // PART 6: Reject masked keys
        if (shouldSendKey && isMaskedApiKey(draftApiKey)) {
            setSaveError('API key tidak valid — terdeteksi karakter masking (***, ••, ...). Masukkan key asli.');
            return;
        }

        // PART 5: If not editing key and no key exists yet, require key
        if (!shouldSendKey && !apiKeySet) {
            setSaveError('API key wajib diisi untuk konfigurasi baru.');
            return;
        }

        try {
            // Sanitize inputs
            const sanitizedKey = shouldSendKey ? sanitizeInput(draftApiKey) : '';
            const sanitizedBaseUrl = draftBaseUrl ? sanitizeInput(draftBaseUrl) : undefined;
            const sanitizedModel = sanitizeInput(draftModel || provider.models[0]?.id || '');

            await saveProviderConfigToDb(
                activeProviderId,
                sanitizedKey, // Empty = keep existing key (PART 5 handled server-side)
                sanitizedModel,
                sanitizedBaseUrl,
                false
            );

            // Reload config from database to get updated preview
            const cfg = await loadConfigFromDb();
            setConfig(cfg);

            // Update preview state
            const updated = cfg.providers.find(p => p.providerId === activeProviderId);
            if (updated) {
                setApiKeySet(updated.apiKeySet);
                setApiKeyPreview(updated.apiKeyPreview || '');
                // If user just set a new key, exit editing mode
                if (shouldSendKey) {
                    setIsEditingApiKey(false);
                    setDraftApiKey('');
                }
            }

            setSaved(activeProviderId);
            setTimeout(() => setSaved(null), 2500);
        } catch (error: any) {
            setSaveError(error.message);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Hapus konfigurasi ${provider.name}? API key akan dihapus permanen.`)) return;
        try {
            await deleteProviderConfigFromDb(activeProviderId);
            const cfg = await loadConfigFromDb();
            setConfig(cfg);

            // Reset all key-related state
            setApiKeySet(false);
            setApiKeyPreview('');
            setIsEditingApiKey(false);
            setDraftApiKey('');
            setDraftBaseUrl('');
            setSaved(null);
            setSaveError(null);
        } catch (error: any) {
            alert(`Gagal menghapus: ${error.message}`);
        }
    };

    const handleSetActive = async () => {
        try {
            await setActiveProviderInDb(activeProviderId, draftModel || 'auto');
            const cfg = await loadConfigFromDb();
            setConfig(cfg);
            setSaved(activeProviderId);
            setTimeout(() => setSaved(null), 2000);
        } catch (error: any) {
            alert(`Gagal set active: ${error.message}`);
        }
    };

    const handleTest = async () => {
        // For testing, we need the actual key. The key to test is:
        // - If editing mode: use draftApiKey
        // - If key exists but not editing: we don't have the key client-side
        //   → use a test endpoint that loads key server-side from DB
        const keyToTest = isEditingApiKey ? draftApiKey.trim() : '';
        if (!keyToTest && !apiKeySet) return;

        setTesting(true);
        setTestResult(null);
        try {
            const sanitizedKey = keyToTest ? sanitizeInput(keyToTest) : '';
            const sanitizedBaseUrl = draftBaseUrl ? sanitizeInput(draftBaseUrl) : undefined;
            const sanitizedModel = sanitizeInput(draftModel);

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Halo, balas singkat dengan satu kalimat saja.' }],
                    config: {
                        provider: activeProviderId,
                        apiKey: sanitizedKey, // Empty = server loads from DB
                        model: sanitizedModel,
                        baseUrl: sanitizedBaseUrl,
                    },
                }),
            });

            const contentType = res.headers.get('content-type');
            let data: any;

            if (contentType?.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { error: 'Respons tidak valid dari server' };
                }
            }

            if (res.ok) {
                setTestResult({ success: true, message: data.message || 'Koneksi berhasil!' });
            } else {
                setTestResult({ success: false, message: data.error || 'Gagal terhubung' });
            }
        } catch (err: any) {
            setTestResult({ success: false, message: err.message || 'Gagal menghubungi server' });
        } finally {
            setTesting(false);
        }
    };

    const handleTestCustomModel = async () => {
        const keyToTest = isEditingApiKey ? draftApiKey.trim() : '';
        if ((!keyToTest && !apiKeySet) || !customModelName.trim()) return;
        setTestingCustom(true);
        setTestResult(null);
        try {
            const sanitizedKey = keyToTest ? sanitizeInput(keyToTest) : '';
            const sanitizedBaseUrl = draftBaseUrl ? sanitizeInput(draftBaseUrl) : undefined;
            const sanitizedModelName = sanitizeInput(customModelName);

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Halo, balas singkat dengan satu kalimat saja.' }],
                    config: {
                        provider: activeProviderId,
                        apiKey: sanitizedKey,
                        model: sanitizedModelName,
                        baseUrl: sanitizedBaseUrl,
                    },
                }),
            });

            const contentType = res.headers.get('content-type');
            let data: any;

            if (contentType?.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { error: 'Respons tidak valid dari server' };
                }
            }

            if (res.ok) {
                addCustomModel(activeProviderId, {
                    id: customModelName.trim(),
                    label: customModelName.trim(),
                    inputPrice: 0,
                    outputPrice: 0,
                    capabilities: { vision: false, reasoning: false, tools: true, fast: false },
                });
                setDraftModel(customModelName.trim());
                setCustomModelName('');
                const cfg = await loadConfigFromDb();
                setConfig(cfg);
                setTestResult({ success: true, message: `Model "${customModelName.trim()}" berhasil ditambahkan!` });
            } else {
                setTestResult({ success: false, message: data.error || 'Gagal terhubung' });
            }
        } catch (err: any) {
            setTestResult({ success: false, message: err.message || 'Gagal menghubungi server' });
        } finally {
            setTestingCustom(false);
        }
    };

    return (
        <div className="max-w-5xl space-y-5">
            {/* Active provider banner */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-xs text-blue-700 uppercase font-semibold tracking-wide mb-1">Provider Aktif</p>
                        <p className="text-base font-bold text-gray-900">
                            {config.activeProvider === 'auto'
                                ? 'Auto (pilih otomatis)'
                                : PROVIDERS.find(p => p.id === config.activeProvider)?.name || config.activeProvider}
                            {config.activeModel !== 'auto' && (
                                <span className="text-sm text-gray-500 font-normal"> · {config.activeModel}</span>
                            )}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            Provider terkonfigurasi: {config.providers.filter(p => p.apiKeySet).length} dari {PROVIDERS.length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Provider tabs */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="border-b border-gray-200 overflow-x-auto">
                    <div className="flex gap-1 px-2 py-2 min-w-max">
                        {PROVIDERS.map(p => {
                            const configured = !!config.providers.find(c => c.providerId === p.id)?.apiKeySet;
                            const active = activeProviderId === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => handleProviderTab(p.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${active
                                        ? 'bg-blue-600 text-white'
                                        : configured
                                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    {configured && !active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                    {p.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {/* Provider info */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="text-base font-semibold text-gray-900">{provider.name}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{provider.description}</p>
                        </div>
                        {provider.signupUrl && (
                            <a
                                href={provider.signupUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                                Dapatkan API key
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>

                    {/* ── PART 4 & 9: API Key UX ─────────────────────────────────── */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">API Key</label>

                        {apiKeySet && !isEditingApiKey ? (
                            /* Key exists + not editing → show preview + Edit/Delete */
                            <div className="flex items-center gap-2">
                                <code className="px-3 py-2 border rounded-lg text-sm bg-gray-50 font-mono select-all">
                                    {apiKeyPreview}
                                </code>

                                <button
                                    onClick={() => {
                                        setIsEditingApiKey(true);
                                        setDraftApiKey('');
                                        setSaveError(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                    Edit API Key
                                </button>

                                <button
                                    onClick={handleDelete}
                                    className="inline-flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete API Key
                                </button>
                            </div>
                        ) : (
                            /* No key OR editing → show empty password input */
                            <input
                                type="password"
                                value={draftApiKey}
                                onChange={e => setDraftApiKey(e.target.value)}
                                placeholder={isEditingApiKey ? "Masukkan API key baru" : provider.placeholder}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        )}

                        {isEditingApiKey && apiKeySet && (
                            <p className="text-[10px] text-gray-400 mt-1">
                                Kosongkan input jika tidak ingin mengganti API key yang tersimpan.
                            </p>
                        )}
                    </div>

                    {/* Base URL — only for providers with hasBaseUrl */}
                    {provider.hasBaseUrl && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                <Server className="w-3 h-3 inline mr-1" />
                                Base URL
                            </label>
                            <input
                                type="text"
                                value={draftBaseUrl}
                                onChange={e => setDraftBaseUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    )}

                    {/* Model picker — compact cards like 9router */}
                    {allModels.length > 0 && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Model <span className="text-gray-400 font-normal">(termurah → termahal)</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {allModels.map(m => {
                                    const isSelected = draftModel === m.id;
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => setDraftModel(m.id)}
                                            className={`relative text-left px-3 py-2 rounded-lg border transition-all group ${isSelected
                                                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <span className="font-medium text-gray-900 text-xs leading-tight">{m.label}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigator.clipboard.writeText(m.id);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded transition-opacity"
                                                    title="Copy model ID"
                                                >
                                                    <Copy className="w-3 h-3 text-gray-500" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                                <CapabilityBadges caps={m.capabilities} size="xs" />
                                            </div>
                                            <div className="text-[9px] text-gray-400 font-mono">
                                                {fmtPrice(m.inputPrice)} in · {fmtPrice(m.outputPrice)} out
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Custom model name for openai-compatible */}
                    {allModels.length === 0 && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Model</label>
                            <input
                                type="text"
                                value={draftModel}
                                onChange={e => setDraftModel(e.target.value)}
                                placeholder="contoh: llama-3.1-70b"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    )}

                    {/* Add custom model — for providers with models */}
                    {allModels.length > 0 && (
                        <div className="pt-2 border-t border-gray-100">
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                <Plus className="w-3 h-3 inline mr-1" />
                                Tambah Model Custom
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customModelName}
                                    onChange={e => setCustomModelName(e.target.value)}
                                    placeholder="Nama model (contoh: kr/claude-haiku-4.5)"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    onKeyDown={e => { if (e.key === 'Enter') handleTestCustomModel(); }}
                                />
                                <button
                                    onClick={handleTestCustomModel}
                                    disabled={!customModelName.trim() || testingCustom}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex-shrink-0"
                                >
                                    {testingCustom ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        'Test & Tambah'
                                    )}
                                </button>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">
                                Masukkan nama model, lalu klik Test & Tambah. Jika valid, model akan otomatis muncul di pilihan.
                            </p>
                        </div>
                    )}

                    {/* Save error */}
                    {saveError && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-800 font-medium">{saveError}</p>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                        <button
                            onClick={handleSave}
                            disabled={!apiKeySet && !draftApiKey.trim()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {saved === activeProviderId ? <Check className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                            {saved === activeProviderId ? 'Tersimpan' : 'Simpan'}
                        </button>
                        <button
                            onClick={handleSetActive}
                            disabled={!apiKeySet}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            <Brain className="w-4 h-4" />
                            Set Aktif
                        </button>
                        <button
                            onClick={handleTest}
                            disabled={(!apiKeySet && !draftApiKey.trim()) || testing}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                            {testing ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Brain className="w-4 h-4" />
                            )}
                            {testing ? 'Testing...' : 'Test Koneksi'}
                        </button>
                        {apiKeySet && !isEditingApiKey && (
                            <button
                                onClick={handleDelete}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors ml-auto"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Hapus
                            </button>
                        )}
                    </div>

                    {testResult && (
                        <div className={`p-3 rounded-lg ${testResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                            <div className="flex items-start gap-2">
                                {testResult.success
                                    ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    : <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
                                <div className="text-xs">
                                    <p className={`font-semibold ${testResult.success ? 'text-emerald-800' : 'text-red-800'}`}>
                                        {testResult.success ? 'Berhasil terhubung' : 'Gagal'}
                                    </p>
                                    <p className={`mt-0.5 ${testResult.success ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {testResult.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedModel && apiKeySet && (
                        <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                            <span className="font-semibold">{selectedModel.label}</span> · perkiraan ~{fmtPrice(selectedModel.inputPrice + selectedModel.outputPrice)} per 1M token campuran
                        </div>
                    )}
                </div>
            </div>

            {/* Pricing reference */}
            <details className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    Tabel Harga Lengkap (cheap → expensive)
                </summary>
                <div className="px-5 pb-4 overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-2 py-2 text-left font-semibold text-gray-700">Provider</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-700">Model</th>
                                <th className="px-2 py-2 text-left font-semibold text-gray-700">Kemampuan</th>
                                <th className="px-2 py-2 text-right font-semibold text-gray-700">Input/1M</th>
                                <th className="px-2 py-2 text-right font-semibold text-gray-700">Output/1M</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allModelsSorted().map(m => (
                                <tr key={`${m.providerId}-${m.id}`} className="border-t border-gray-100">
                                    <td className="px-2 py-2 text-gray-600">{m.providerName}</td>
                                    <td className="px-2 py-2 text-gray-900">{m.label}</td>
                                    <td className="px-2 py-2"><CapabilityBadges caps={m.capabilities} size="xs" /></td>
                                    <td className="px-2 py-2 text-right">{fmtPrice(m.inputPrice)}</td>
                                    <td className="px-2 py-2 text-right">{fmtPrice(m.outputPrice)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1.5">
                <p className="font-semibold">💡 Tips</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>API key disimpan aman di database dengan enkripsi AES-256-GCM. Tidak dikirim ke browser dalam bentuk lengkap.</li>
                    <li>Konfigurasi beberapa provider sekaligus, lalu pilih mode <strong>Auto</strong> di chat untuk pemilihan otomatis berdasarkan kebutuhan.</li>
                    <li>Mode <strong>Thinking</strong> akan otomatis pakai model dengan kemampuan reasoning (jika tersedia).</li>
                    <li>Mode <strong>Instant</strong> akan pakai model paling cepat & murah.</li>
                </ul>
            </div>

            {/* ── Pengaturan KR·AI: Chat History ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    Riwayat Chat KR·AI
                </h2>
                <p className="text-xs text-gray-500">
                    Riwayat percakapan disimpan ke database Supabase. Percakapan yang lebih lama dari batas yang ditentukan akan otomatis dihapus.
                </p>

                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Simpan riwayat selama
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={1}
                                max={365}
                                value={retentionDays}
                                onChange={e => setRetentionDays(Number(e.target.value))}
                                className="flex-1 accent-blue-600"
                                aria-label="Durasi penyimpanan riwayat chat dalam hari"
                                title="Geser untuk mengatur berapa lama riwayat chat disimpan"
                            />
                            <span className="text-sm font-semibold text-gray-900 w-20 text-right">
                                {retentionDays} hari
                            </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                            <span>1 hari</span>
                            <span>1 tahun</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleSaveRetention}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        {retentionSaved ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        {retentionSaved ? 'Tersimpan' : 'Simpan Pengaturan'}
                    </button>
                    <button
                        onClick={handlePruneNow}
                        disabled={pruning}
                        className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                        <Trash2 className="w-4 h-4" />
                        {pruning ? 'Membersihkan...' : 'Bersihkan Sekarang'}
                    </button>
                </div>

                {pruneResult && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded px-3 py-2">{pruneResult}</p>
                )}
            </div>
        </div>
    );
}