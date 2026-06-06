'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Key, Server, Check, AlertCircle, ExternalLink, Eye, Lightbulb, Wrench, Zap, DollarSign, Trash2, Clock, Plus, Copy, Cloud, CloudOff, Download, Upload, Pencil, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';

import { normalizeAiText } from '@/lib/ai/normalizeAiText';

const AIToolsTable = dynamic(() => import('@/components/ai/AIToolsTable'), { ssr: false });
import TOOL_REGISTRY from '@/lib/ai/toolRegistry';
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
import { saveAIConfig, loadAIConfig, saveCustomModel } from '@/app/(dashboard)/pengaturan/ai-actions';
import ModelFetchButton from './ModelFetchButton';
import ModelDropdown from './ModelDropdown';
import { getModels } from '@/lib/ai/modelClient';
import type { ProviderModel } from '@/types/ai-models';

const fmtPrice = (v: number) => v === 0 ? 'Gratis' : `$${v.toFixed(2)}`;

/** Format relative time in Indonesian (duplicated from ModelDropdown for the info line) */
function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return 'Belum pernah';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffSec < 60) return 'baru saja';
    if (diffMin < 60) return `${diffMin} menit yang lalu`;
    if (diffHour < 24) return `${diffHour} jam yang lalu`;
    if (diffDay < 7) return `${diffDay} hari yang lalu`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

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

/**
 * Mask API key for display — shows first 4 and last 4 characters.
 * Returns empty string if key is too short.
 */
function maskApiKey(key: string): string {
    if (!key || key.length < 8) return '';
    const visibleStart = key.slice(0, 4);
    const visibleEnd = key.slice(-4);
    const maskedLength = key.length - 8;
    return `${visibleStart}${'•'.repeat(Math.min(maskedLength, 20))}${visibleEnd}`;
}

/** Validate API key format — basic length and character checks */
function validateApiKey(key: string): { valid: boolean; error?: string } {
    if (!key || key.trim().length === 0) {
        return { valid: false, error: 'API key tidak boleh kosong' };
    }
    if (key.trim().length < 8) {
        return { valid: false, error: 'API key terlalu pendek (minimum 8 karakter)' };
    }
    if (isMaskedApiKey(key)) {
        return { valid: false, error: 'API key tidak valid — terdeteksi karakter masking (***, ••, ...). Masukkan key asli.' };
    }
    return { valid: true };
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

interface AISettingsPageProps {
    section?: 'ai' | 'insight' | 'sistem';
}

export default function AISettingsPage({ section = 'ai' }: AISettingsPageProps) {
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

    // AI Insight settings state
    const [insightSettings, setInsightSettings] = useState({
        enabled: false,
        mode: 'ai-with-fallback' as 'rule-based' | 'ai-generated' | 'ai-with-fallback',
        provider: '',
        model: '',
        cacheTtlMinutes: 30,
        autoRefresh: true,
    });
    const [insightSaved, setInsightSaved] = useState<string | null>(null);
    const [testingInsight, setTestingInsight] = useState(false);
    const [insightTestResult, setInsightTestResult] = useState<{ success: boolean; message: string } | null>(null);

    /** Helper to save a single AI Insight setting via POST /api/app-settings */
    const saveInsightSetting = async (key: string, value: string) => {
        await fetch('/api/app-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        });
    };

    // Fetched models state (per-provider, keyed by providerId)
    const [fetchedModels, setFetchedModels] = useState<ProviderModel[]>([]);
    const [fetchedModelsLastFetched, setFetchedModelsLastFetched] = useState<string | null>(null);
    const [loadingFetchedModels, setLoadingFetchedModels] = useState(false);

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

            // Load AI Insight settings from app_settings
            try {
                const settingsRes = await fetch('/api/app-settings');
                if (settingsRes.ok) {
                    const s = await settingsRes.json();
                    setInsightSettings({
                        enabled: s.ai_insight_enabled === 'true',
                        mode: (s.ai_insight_mode || 'ai-with-fallback') as 'rule-based' | 'ai-generated' | 'ai-with-fallback',
                        provider: s.ai_insight_provider || '',
                        model: s.ai_insight_model || '',
                        cacheTtlMinutes: parseInt(s.ai_insight_cache_ttl_minutes || '30', 10),
                        autoRefresh: s.ai_insight_auto_refresh !== 'false',
                    });
                }
            } catch { }
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

    // Load fetched models when active tab changes
    useEffect(() => {
        async function loadFetchedModels() {
            setLoadingFetchedModels(true);
            try {
                const response = await getModels(activeProviderId);
                setFetchedModels(response.models || []);
                setFetchedModelsLastFetched(response.lastFetched || null);
            } catch (error) {
                console.error('Failed to load fetched models:', error);
            } finally {
                setLoadingFetchedModels(false);
            }
        }

        loadFetchedModels();
    }, [activeProviderId]);

    if (!config) return null;

    const provider = PROVIDERS.find(p => p.id === activeProviderId);
    if (!provider) return null;

    // Merge provider models with custom models AND fetched models
    const customModels = getCustomModels(activeProviderId);

    // Convert ProviderModel[] to ModelInfo[] for merging with existing model list
    const fetchedModelInfos: ModelInfo[] = fetchedModels.map((fm) => ({
        id: fm.modelId,
        label: fm.displayName,
        inputPrice: fm.pricing?.input ?? 0,
        outputPrice: fm.pricing?.output ?? 0,
        capabilities: {
            vision: fm.capabilities?.vision ?? false,
            reasoning: fm.capabilities?.reasoning ?? false,
            tools: fm.capabilities?.functionCalling ?? false,
            fast: false,
        },
    }));

    // Merge: hardcoded models first, then fetched models (deduplicated by id), then custom models
    const hardcodedIds = new Set(provider.models.map((m) => m.id));
    const fetchedDeduped = fetchedModelInfos.filter((m) => !hardcodedIds.has(m.id));
    const customIds = new Set([...hardcodedIds, ...fetchedDeduped.map((m) => m.id)]);
    const customDeduped = customModels.filter((m) => !customIds.has(m.id));

    const allModels = [...provider.models, ...fetchedDeduped, ...customDeduped];

    const selectedModel = allModels.find(m => m.id === draftModel);

    const handleProviderTab = (id: ProviderId) => {
        setActiveProviderId(id);
        setTestResult(null);
        setSaved(null);
        setSaveError(null);
        // Reset fetched models so the useEffect reloads for the new provider
        setFetchedModels([]);
        setFetchedModelsLastFetched(null);

        const c = config.providers.find(p => p.providerId === id);
        const hardcodedModels = PROVIDERS.find(p => p.id === id)?.models || [];
        if (c) {
            // PART 4: Load preview state — NOT full key
            setApiKeySet(c.apiKeySet);
            setApiKeyPreview(c.apiKeyPreview || '');
            setIsEditingApiKey(false);
            setDraftApiKey('');
            // Try to restore the saved model; if it doesn't match hardcoded models, keep it anyway
            setDraftModel(c.model || hardcodedModels[0]?.id || '');
            setDraftBaseUrl(c.baseUrl || '');
        } else {
            // New provider (not yet configured)
            setApiKeySet(false);
            setApiKeyPreview('');
            setIsEditingApiKey(true); // FIX 1: new providers start in editing mode so user can type key
            setDraftApiKey('');
            setDraftModel(hardcodedModels[0]?.id || '');
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

            // Auto-enable AI Insight if user just saved a key and AI insight is not yet enabled
            if (shouldSendKey && !insightSettings.enabled) {
                await saveInsightSetting('ai_insight_enabled', 'true');
                setInsightSettings(prev => ({ ...prev, enabled: true }));
            }

            setSaved(activeProviderId);
            setTimeout(() => setSaved(null), 2500);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan';
            setSaveError(errorMessage);
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
            setDraftModel('');
            setFetchedModels([]);
            setFetchedModelsLastFetched(null);
            setSaved(null);
            setSaveError(null);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Gagal menghapus konfigurasi';
            alert(`Gagal menghapus: ${errorMessage}`);
        }
    };

    const handleSetActive = async () => {
        try {
            await setActiveProviderInDb(activeProviderId, draftModel || 'auto');
            const cfg = await loadConfigFromDb();
            setConfig(cfg);
            setSaved(activeProviderId);
            setTimeout(() => setSaved(null), 2000);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Gagal mengatur provider aktif';
            alert(`Gagal set active: ${errorMessage}`);
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
                // Centralized normalization — strips any JSON wrapping
                const displayMsg = normalizeAiText(data.message || 'Koneksi berhasil!');
                setTestResult({ success: true, message: displayMsg });
            } else {
                const errMsg = normalizeAiText(data.error || 'Gagal terhubung');
                setTestResult({ success: false, message: errMsg });
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Gagal menghubungi server';
            setTestResult({ success: false, message: errorMessage });
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
                const modelId = customModelName.trim();
                const providerInfo = PROVIDERS.find(p => p.id === activeProviderId);
                const providerName = providerInfo?.name || activeProviderId;

                // Save to DB via server action so it persists beyond provider fetch
                await saveCustomModel(activeProviderId, providerName, modelId, modelId);

                // Also save to localStorage as cache/fallback
                addCustomModel(activeProviderId, {
                    id: modelId,
                    label: modelId,
                    inputPrice: 0,
                    outputPrice: 0,
                    capabilities: { vision: false, reasoning: false, tools: true, fast: false },
                });
                setDraftModel(modelId);
                setCustomModelName('');
                const cfg = await loadConfigFromDb();
                setConfig(cfg);
                setTestResult({ success: true, message: `Model "${modelId}" berhasil ditambahkan!` });
            } else {
                setTestResult({ success: false, message: data.error || 'Gagal terhubung' });
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Gagal menghubungi server';
            setTestResult({ success: false, message: errorMessage });
        } finally {
            setTestingCustom(false);
        }
    };

    return (
        <div className="max-w-5xl space-y-5">
            {/* ── Section: AI (Provider Config) ── */}
            {section === 'ai' && (
                <>
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

                            {/* ── PART 4 & 9: API Key UX — Enhanced Masking ─────────────── */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">API Key</label>

                                {apiKeySet && !isEditingApiKey ? (
                                    /* Key exists + not editing → show masked preview + Edit/Delete */
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-gray-50 font-mono text-sm select-all">
                                            <span className="text-gray-600 truncate" title="API Key tersimpan (enkripsi AES-256-GCM)">
                                                {maskApiKey(apiKeyPreview) || '••••••••••••••••'}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(apiKeyPreview);
                                                }}
                                                className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                                                title="Salin API Key"
                                                aria-label="Salin API Key ke clipboard"
                                            >
                                                <Copy className="w-3 h-3 text-gray-500" />
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setIsEditingApiKey(true);
                                                setDraftApiKey('');
                                                setSaveError(null);
                                            }}
                                            className="inline-flex items-center gap-1 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors"
                                            aria-label="Edit API Key"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Edit
                                        </button>

                                        <button
                                            onClick={handleDelete}
                                            className="inline-flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                                            aria-label="Hapus API Key"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Hapus
                                        </button>
                                    </div>
                                ) : (
                                    /* No key OR editing → show password input with validation feedback */
                                    <div>
                                        <input
                                            type="password"
                                            value={draftApiKey}
                                            onChange={e => {
                                                setDraftApiKey(e.target.value);
                                                // Clear error when user starts typing
                                                if (saveError && saveError.includes('API key')) {
                                                    setSaveError(null);
                                                }
                                            }}
                                            placeholder={isEditingApiKey ? "Masukkan API key baru" : provider.placeholder}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            aria-label="API Key input"
                                        />
                                        {draftApiKey && !isMaskedApiKey(draftApiKey) && (
                                            <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                                                <Check className="w-3 h-3" />
                                                Format API key valid
                                            </p>
                                        )}
                                    </div>
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

                            {/* ── Model Fetch & Select (new) ─────────────────────────── */}
                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Model <span className="text-gray-400 font-normal">(pilih atau ketik manual)</span>
                                </label>

                                {/* Fetch button + Status row */}
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <ModelFetchButton
                                        providerId={activeProviderId}
                                        size="sm"
                                        onSuccess={(models) => {
                                            setFetchedModels(models);
                                            setFetchedModelsLastFetched(new Date().toISOString());
                                        }}
                                    />
                                    {fetchedModelsLastFetched && (
                                        <span className="text-[10px] text-gray-400">
                                            Terakhir diambil: {formatRelativeTime(fetchedModelsLastFetched)}
                                        </span>
                                    )}
                                </div>

                                {/* Searchable Dropdown */}
                                <ModelDropdown
                                    providerId={activeProviderId}
                                    value={draftModel}
                                    onChange={(modelId) => setDraftModel(modelId)}
                                    placeholder="Pilih model atau ketik manual..."
                                    disabled={loadingFetchedModels}
                                />

                                {/* Model count info */}
                                {fetchedModels.length > 0 && (
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        {fetchedModels.length} model tersedia dari provider
                                    </p>
                                )}
                            </div>

                            {/* Model picker — compact cards like 9router (hardcoded models) */}
                            {provider.models.length > 0 && (
                                <div className="pt-2 border-t border-gray-100">
                                    <details className="group">
                                        <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700 mb-1.5 list-none flex items-center gap-1">
                                            <span className="transition-transform group-open:rotate-90">▶</span>
                                            Lihat model hardcoded ({provider.models.length})
                                        </summary>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                            {provider.models.map(m => {
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
                                    </details>
                                </div>
                            )}

                            {/* Removed duplicate "Nama Model" block */}

                            {/* Model picker — compact cards (hidden) */}
                            {false && allModels.length > 0 && (
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

                    {/* ── Section: Tools Table ── */}
                    <details className="bg-white rounded-xl border border-gray-200 shadow-sm group">
                        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 flex items-center gap-2 list-none">
                            <Wrench className="w-4 h-4 text-blue-600" />
                            <span className="transition-transform group-open:rotate-90">▶</span>
                            Daftar Tools KR·AI ({TOOL_REGISTRY.length} tools)
                        </summary>
                        <div className="px-5 pb-4">
                            <AIToolsTable />
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
                </>
            )}

            {/* ── Section: AI Insight ── */}
            {section === 'insight' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                    <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        Pengaturan AI Insight
                    </h2>
                    <p className="text-xs text-gray-500">
                        Atur bagaimana insight otomatis dihasilkan untuk kartu insight di dashboard dan halaman lainnya.
                    </p>

                    {/* 1. Enable AI Insight */}
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Aktifkan AI Insight</label>
                            <p className="text-xs text-gray-500">Generate insight otomatis menggunakan AI</p>
                        </div>
                        <button
                            onClick={async () => {
                                const next = insightSettings.enabled ? 'false' : 'true';
                                await saveInsightSetting('ai_insight_enabled', next);
                                setInsightSettings(prev => ({ ...prev, enabled: !prev.enabled }));
                                setInsightSaved('Aktifkan AI Insight');
                                setTimeout(() => setInsightSaved(null), 2000);
                            }}
                            className={`relative w-11 h-6 rounded-full transition-colors ${insightSettings.enabled ? 'bg-purple-600' : 'bg-gray-300'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${insightSettings.enabled ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {/* 2. Insight Mode */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Mode Insight</label>
                        <div className="flex flex-col gap-2">
                            {[
                                { value: 'rule-based', label: 'Hanya Rule-based', desc: 'Insight berdasarkan aturan statis, tanpa AI' },
                                { value: 'ai-generated', label: 'AI Generated saja', desc: 'Hanya insight dari AI, tanpa fallback' },
                                { value: 'ai-with-fallback', label: 'AI + Rule Fallback', desc: 'AI dulu, fallback ke rule-based jika gagal' },
                            ].map(opt => (
                                <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${insightSettings.mode === opt.value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                    <input
                                        type="radio"
                                        name="insight_mode"
                                        value={opt.value}
                                        checked={insightSettings.mode === opt.value}
                                        onChange={async () => {
                                            await saveInsightSetting('ai_insight_mode', opt.value);
                                            setInsightSettings(prev => ({ ...prev, mode: opt.value as 'rule-based' | 'ai-generated' | 'ai-with-fallback' }));
                                            setInsightSaved('Mode Insight');
                                            setTimeout(() => setInsightSaved(null), 2000);
                                        }}
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                                        <p className="text-xs text-gray-500">{opt.desc}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 3. Provider */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider AI untuk Insight</label>
                        <select
                            value={insightSettings.provider}
                            onChange={async (e) => {
                                const val = e.target.value;
                                await saveInsightSetting('ai_insight_provider', val);
                                setInsightSettings(prev => ({ ...prev, provider: val }));
                                setInsightSaved('Provider Insight');
                                setTimeout(() => setInsightSaved(null), 2000);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                        >
                            <option value="">Auto (pakai provider aktif)</option>
                            {config.providers.filter(p => p.apiKeySet).map(p => (
                                <option key={p.providerId} value={p.providerId}>
                                    {PROVIDERS.find(pr => pr.id === p.providerId)?.name || p.providerId}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Kosongkan untuk menggunakan provider AI Chat yang aktif.</p>
                    </div>

                    {/* 4. Model */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Model AI untuk Insight</label>
                        <ModelDropdown
                            providerId={(insightSettings.provider as ProviderId) || activeProviderId}
                            value={insightSettings.model}
                            onChange={async (modelId) => {
                                await saveInsightSetting('ai_insight_model', modelId);
                                setInsightSettings(prev => ({ ...prev, model: modelId }));
                                setInsightSaved('Model Insight');
                                setTimeout(() => setInsightSaved(null), 2000);
                            }}
                            placeholder="Kosongkan untuk pakai default provider"
                        />
                        <p className="text-xs text-gray-500 mt-1">Kosongkan untuk menggunakan model default dari provider.</p>
                    </div>

                    {/* 5. Cache duration */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Durasi Cache Insight</label>
                        <p className="text-xs text-gray-500 mb-2">Insight yang sama akan disajikan dari cache selama durasi ini.</p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: 15, label: '15 menit' },
                                { value: 30, label: '30 menit' },
                                { value: 60, label: '1 jam' },
                                { value: 360, label: '6 jam' },
                                { value: 1440, label: '24 jam' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={async () => {
                                        await saveInsightSetting('ai_insight_cache_ttl_minutes', String(opt.value));
                                        setInsightSettings(prev => ({ ...prev, cacheTtlMinutes: opt.value }));
                                        setInsightSaved('Cache');
                                        setTimeout(() => setInsightSaved(null), 2000);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${insightSettings.cacheTtlMinutes === opt.value
                                        ? 'bg-purple-600 text-white border-purple-600'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 6. Auto refresh */}
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Auto Refresh Insight</label>
                            <p className="text-xs text-gray-500">Generate ulang insight secara berkala saat halaman terbuka</p>
                        </div>
                        <button
                            onClick={async () => {
                                const next = insightSettings.autoRefresh ? 'false' : 'true';
                                await saveInsightSetting('ai_insight_auto_refresh', next);
                                setInsightSettings(prev => ({ ...prev, autoRefresh: !prev.autoRefresh }));
                                setInsightSaved('Auto Refresh');
                                setTimeout(() => setInsightSaved(null), 2000);
                            }}
                            className={`relative w-11 h-6 rounded-full transition-colors ${insightSettings.autoRefresh ? 'bg-purple-600' : 'bg-gray-300'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${insightSettings.autoRefresh ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {/* Save indicator */}
                    {insightSaved && (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                            <Check className="w-3.5 h-3.5" />
                            <span>Pengaturan &ldquo;{insightSaved}&rdquo; tersimpan</span>
                        </div>
                    )}

                    {/* Test Generate Insight */}
                    <div className="pt-2 border-t border-gray-100">
                        <button
                            onClick={async () => {
                                setTestingInsight(true);
                                setInsightTestResult(null);
                                try {
                                    const res = await fetch('/api/ai/insight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'settings-test', prompt: 'Analisis singkat performa bisnis hari ini: booking, pendapatan, dan okupansi. Berikan dalam 2-3 paragraf.', title: 'Test Insight', forceRefresh: true }) });
                                    const data = await res.json();
                                    if (data.error && data.fallback) {
                                        setInsightTestResult({ success: false, message: 'AI Insight tidak aktif atau gagal. Cek pengaturan provider dan API key.' });
                                    } else if (data.response?.message) {
                                        setInsightTestResult({ success: true, message: data.response.message.substring(0, 300) });
                                    } else {
                                        setInsightTestResult({ success: false, message: 'Respons tidak valid dari server.' });
                                    }
                                } catch (err: unknown) {
                                    const errorMessage = err instanceof Error ? err.message : 'Gagal menghubungi server';
                                    setInsightTestResult({ success: false, message: errorMessage });
                                } finally {
                                    setTestingInsight(false);
                                }
                            }}
                            disabled={testingInsight}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                            {testingInsight ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Sparkles className="w-4 h-4" />
                            )}
                            {testingInsight ? 'Mengenerate...' : 'Test Generate Insight'}
                        </button>
                        {insightTestResult && (
                            <div className={`mt-3 p-3 rounded-lg border ${insightTestResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                <div className="flex items-start gap-2">
                                    {insightTestResult.success ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
                                    <div className="text-xs">
                                        <p className={`font-semibold ${insightTestResult.success ? 'text-emerald-800' : 'text-red-800'}`}>{insightTestResult.success ? 'Insight berhasil digenerate' : 'Gagal'}</p>
                                        <p className={`mt-0.5 ${insightTestResult.success ? 'text-emerald-700' : 'text-red-700'}`}>{normalizeAiText(insightTestResult.message)}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Section: Sistem ── */}
            {section === 'sistem' && (
                <>
                    {/* Chat History */}
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
                                <label className="block text-xs font-medium text-gray-700 mb-1">Simpan riwayat selama</label>
                                <div className="flex items-center gap-3">
                                    <input type="range" min={1} max={365} value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))} className="flex-1 accent-blue-600" aria-label="Durasi penyimpanan riwayat chat dalam hari" title="Geser untuk mengatur berapa lama riwayat chat disimpan" />
                                    <span className="text-sm font-semibold text-gray-900 w-20 text-right">{retentionDays} hari</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                                    <span>1 hari</span>
                                    <span>1 tahun</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={handleSaveRetention} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                                {retentionSaved ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                {retentionSaved ? 'Tersimpan' : 'Simpan Pengaturan'}
                            </button>
                            <button onClick={handlePruneNow} disabled={pruning} className="inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                                <Trash2 className="w-4 h-4" />
                                {pruning ? 'Membersihkan...' : 'Bersihkan Sekarang'}
                            </button>
                        </div>

                        {pruneResult && <p className="text-xs text-gray-600 bg-gray-50 rounded px-3 py-2">{pruneResult}</p>}
                    </div>

                    {/* Info / Health */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1.5">
                        <p className="font-semibold">🔧 Informasi Sistem</p>
                        <ul className="list-disc list-inside space-y-0.5 ml-1">
                            <li>API key disimpan aman di database dengan enkripsi AES-256-GCM.</li>
                            <li>Riwayat chat disimpan di database Supabase dengan retensi otomatis.</li>
                            <li>Cache insight dibersihkan otomatis berdasarkan durasi yang ditentukan.</li>
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
}