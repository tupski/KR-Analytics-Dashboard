/**
 * ChatModelSelector — compact model selector for the AI Chat interface.
 *
 * Features:
 * - Shows current selected model
 * - Dropdown grouped by provider (OPENAI COMPATIBLE, OPENAI, GOOGLE, etc.)
 * - Search bar to filter models
 * - Model badges (Gratis, Pro, Vision, Reasoning, Flash)
 * - Loading state, empty state, fallback to built-in models
 * - Keyboard navigation + ARIA labels
 * - Custom model input option
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Brain,
    ChevronDown,
    ChevronUp,
    Search,
    Plus,
    ExternalLink,
    Loader2,
    AlertCircle,
    X,
} from 'lucide-react';
import type { ProviderModel } from '@/types/ai-models';
import type { MultiAIConfig } from '@/lib/ai/config';
import type { ProviderId } from '@/lib/ai/models';
import { PROVIDERS } from '@/lib/ai/models';
import ModelBadge, { BadgeType } from './ModelBadge';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatModelSelectorProps {
    currentModel: string;
    onChange: (modelId: string, providerId?: string) => void;
    currentProvider?: string;
    className?: string;
    /** Fetched models from database */
    fetchedModels?: ProviderModel[];
    /** Whether models are being loaded */
    loadingModels?: boolean;
    /** AI config (for built-in model fallback) */
    config?: MultiAIConfig | null;
}

interface DisplayModel {
    id: string;
    displayName: string;
    providerSlug: string;
    providerName: string;
    enabled: boolean;
    badges: BadgeType[];
    isCustom?: boolean;
}

interface GroupedModels {
    providerName: string;
    providerSlug: string;
    models: DisplayModel[];
}

// ── Provider priority order ──────────────────────────────────────────────────

const PROVIDER_PRIORITY_ORDER = [
    'openai-compatible',
    'openai',
    'google',
    'anthropic',
    'deepseek',
    'gemini',
    'groq',
    'openrouter',
    'kiro',
];

function getProviderPriority(slug: string): number {
    const idx = PROVIDER_PRIORITY_ORDER.indexOf(slug);
    return idx === -1 ? 999 : idx;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function getBadgesForDisplayModel(model: DisplayModel): BadgeType[] {
    return model.badges;
}

function getBadgesFromProviderModel(model: ProviderModel): BadgeType[] {
    const badges: BadgeType[] = [];
    const caps = model.capabilities || {};

    if (caps.vision) badges.push('vision');
    if (caps.reasoning) badges.push('reasoning');
    if (caps.functionCalling) badges.push('coding');

    if (model.pricing) {
        const inputPrice = model.pricing.input ?? 0;
        if (inputPrice === 0) badges.push('free');
        else badges.push('pro');
    }

    const name = model.displayName.toLowerCase();
    if (name.includes('flash') || name.includes('turbo') || name.includes('fast')) {
        badges.push('flash');
    }

    return badges;
}

// ── Model grouping logic ─────────────────────────────────────────────────────

function groupModels(
    fetchedModels: ProviderModel[],
    config?: MultiAIConfig | null,
    activeProvider?: string,
): GroupedModels[] {
    const groups: Map<string, GroupedModels> = new Map();

    // Helper to add a model to its group
    const addModel = (model: DisplayModel) => {
        const key = model.providerSlug;
        if (!groups.has(key)) {
            groups.set(key, {
                providerName: model.providerName,
                providerSlug: model.providerSlug,
                models: [],
            });
        }
        groups.get(key)!.models.push(model);
    };

    // 1. Add fetched models (deduplicate by providerSlug + modelId)
    const seen = new Set<string>();
    for (const fm of fetchedModels) {
        const dedupKey = `${fm.providerSlug}/${fm.modelId}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        addModel({
            id: fm.modelId,
            displayName: fm.displayName,
            providerSlug: fm.providerSlug,
            providerName: fm.providerName,
            enabled: fm.enabled,
            badges: getBadgesFromProviderModel(fm),
        });
    }

    // 2. Add built-in models as fallback (only for configured providers)
    if (config) {
        const configuredIds = Object.keys(config.providers);
        for (const provider of PROVIDERS) {
            if (!configuredIds.includes(provider.id)) continue;
            // Skip if we already have fetched models for this provider
            const hasFetched = fetchedModels.some((m) => m.providerSlug === provider.id);
            if (hasFetched) continue;

            for (const m of provider.models) {
                const dedupKey = `${provider.id}/${m.id}`;
                if (seen.has(dedupKey)) continue;
                seen.add(dedupKey);

                const tier = m.inputPrice === 0 ? 'free' : m.inputPrice < 2 ? 'pro' : 'pro';
                const badges: BadgeType[] = [];
                if (m.capabilities.vision) badges.push('vision');
                if (m.capabilities.reasoning) badges.push('reasoning');
                if (m.capabilities.tools) badges.push('coding');
                if (m.capabilities.fast) badges.push('flash');
                if (m.inputPrice === 0) badges.push('free');
                else badges.push(tier as BadgeType);

                addModel({
                    id: m.id,
                    displayName: m.label,
                    providerSlug: provider.id,
                    providerName: provider.name,
                    enabled: true,
                    badges,
                });
            }
        }
    }

    // Sort models within each group by display name
    for (const group of groups.values()) {
        group.models.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    // Convert to array and sort by provider priority
    const result = Array.from(groups.values());
    result.sort((a, b) => {
        // Active provider first
        if (a.providerSlug === activeProvider) return -1;
        if (b.providerSlug === activeProvider) return 1;
        return getProviderPriority(a.providerSlug) - getProviderPriority(b.providerSlug);
    });

    return result;
}

// ── Filter models ─────────────────────────────────────────────────────────────

function filterGroups(groups: GroupedModels[], query: string): GroupedModels[] {
    if (!query.trim()) return groups;
    const q = query.toLowerCase();
    return groups
        .map((g) => ({
            ...g,
            models: g.models.filter(
                (m) =>
                    m.displayName.toLowerCase().includes(q) ||
                    m.id.toLowerCase().includes(q) ||
                    m.providerName.toLowerCase().includes(q),
            ),
        }))
        .filter((g) => g.models.length > 0);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatModelSelector({
    currentModel,
    onChange,
    currentProvider,
    className = '',
    fetchedModels = [],
    loadingModels = false,
    config,
}: ChatModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customModelValue, setCustomModelValue] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Group models
    const groupedModels = useMemo(
        () => groupModels(fetchedModels, config, currentProvider),
        [fetchedModels, config, currentProvider],
    );

    // Filter groups
    const filteredGroups = useMemo(
        () => filterGroups(groupedModels, searchQuery),
        [groupedModels, searchQuery],
    );

    // Flatten for keyboard navigation
    const flatModels = useMemo(() => {
        const list: { model: DisplayModel; groupIdx: number; modelIdx: number }[] = [];
        filteredGroups.forEach((g, gi) => {
            g.models.forEach((m, mi) => {
                list.push({ model: m, groupIdx: gi, modelIdx: mi });
            });
        });
        return list;
    }, [filteredGroups]);

    const totalItems = flatModels.length + 1; // +1 for custom option

    // Find current model display info
    const currentModelDisplay = useMemo(() => {
        // Search in fetched models first
        const fetched = fetchedModels.find((m) => m.modelId === currentModel);
        if (fetched) return fetched.displayName;

        // Search in built-in models
        for (const p of PROVIDERS) {
            const m = p.models.find((m) => m.id === currentModel);
            if (m) return m.label;
        }

        return currentModel;
    }, [currentModel, fetchedModels]);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
                setShowCustomInput(false);
                setSearchQuery('');
                setCustomModelValue('');
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [open]);

    // Focus input on open
    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    // Scroll focused item into view
    useEffect(() => {
        if (listRef.current && focusedIndex >= 0) {
            const el = listRef.current.querySelector(
                `[data-flat-index="${focusedIndex}"]`,
            ) as HTMLElement;
            if (el) el.scrollIntoView({ block: 'nearest' });
        }
    }, [focusedIndex]);

    // Keyboard navigation
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!open) {
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(true);
                    setFocusedIndex(0);
                }
                return;
            }

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex((prev) => (prev + 1) % totalItems);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (focusedIndex >= 0 && focusedIndex < flatModels.length) {
                        const { model } = flatModels[focusedIndex];
                        onChange(model.id, model.providerSlug);
                        setOpen(false);
                        setSearchQuery('');
                    } else if (focusedIndex === flatModels.length) {
                        setShowCustomInput(true);
                    }
                    break;
                case 'Escape':
                    setOpen(false);
                    setShowCustomInput(false);
                    setSearchQuery('');
                    setCustomModelValue('');
                    break;
                default:
                    break;
            }
        },
        [open, focusedIndex, flatModels, totalItems, onChange],
    );

    // Custom model submit
    const handleCustomSubmit = () => {
        if (customModelValue.trim()) {
            onChange(customModelValue.trim());
            setShowCustomInput(false);
            setCustomModelValue('');
            setOpen(false);
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                onKeyDown={handleKeyDown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors w-full max-w-[200px] border border-gray-200"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Pilih model AI"
            >
                <Brain className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span className="truncate flex-1 text-left">{currentModelDisplay}</span>
                {open ? (
                    <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
                ) : (
                    <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                )}
            </button>

            {/* Dropdown panel */}
            {open && !showCustomInput && (
                <div className="absolute bottom-full left-0 mb-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72 max-h-80 flex flex-col">
                    {/* Search bar */}
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setFocusedIndex(0);
                                }}
                                placeholder="Cari model..."
                                className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                aria-label="Cari model"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setFocusedIndex(0);
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                                    aria-label="Hapus pencarian"
                                >
                                    <X className="w-3 h-3 text-gray-400" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Model list */}
                    <ul
                        ref={listRef}
                        className="flex-1 overflow-y-auto py-1"
                        role="listbox"
                        aria-label="Daftar model AI"
                    >
                        {loadingModels ? (
                            <li className="px-3 py-8 text-center text-gray-500 text-sm">
                                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                Memuat model...
                            </li>
                        ) : filteredGroups.length === 0 ? (
                            <li className="px-3 py-6 text-center text-gray-500 text-sm">
                                {searchQuery ? (
                                    <p>Tidak ada model yang cocok dengan {'"'}{searchQuery}{'"'}</p>
                                ) : (
                                    <>
                                        <p>Tidak ada model tersedia.</p>
                                        <p className="text-xs mt-1 text-gray-400">
                                            Belum ada model dari provider. Konfigurasi di Pengaturan AI.
                                        </p>
                                    </>
                                )}
                            </li>
                        ) : (
                            filteredGroups.map((group, gi) => (
                                <li key={group.providerSlug} className="mt-0.5">
                                    {/* Provider header */}
                                    <p className="px-3 pt-2 pb-1 text-[10px] uppercase font-semibold text-gray-400 tracking-wide">
                                        {group.providerName}
                                    </p>
                                    {/* Models */}
                                    {group.models.map((model, mi) => {
                                        const flatIdx =
                                            filteredGroups
                                                .slice(0, gi)
                                                .reduce((sum, g) => sum + g.models.length, 0) + mi;
                                        const isActive = model.id === currentModel;
                                        const isFocused = flatIdx === focusedIndex;

                                        return (
                                            <button
                                                key={`${model.providerSlug}/${model.id}`}
                                                data-flat-index={flatIdx}
                                                role="option"
                                                aria-selected={isActive}
                                                onClick={() => {
                                                    onChange(model.id, model.providerSlug);
                                                    setOpen(false);
                                                    setSearchQuery('');
                                                }}
                                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${isActive
                                                    ? 'bg-blue-50'
                                                    : isFocused
                                                        ? 'bg-blue-50'
                                                        : 'hover:bg-gray-50'
                                                    } ${!model.enabled ? 'opacity-50' : ''}`}
                                            >
                                                {/* Badges */}
                                                <span className="inline-flex gap-0.5 flex-shrink-0">
                                                    {getBadgesForDisplayModel(model).map((badge) => (
                                                        <ModelBadge key={badge} type={badge} size="xs" />
                                                    ))}
                                                </span>
                                                {/* Model name */}
                                                <span className="flex-1 text-gray-800 truncate">
                                                    {model.displayName}
                                                </span>
                                                {/* Active indicator */}
                                                {isActive && (
                                                    <span className="text-blue-600 text-xs flex-shrink-0">✓</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </li>
                            ))
                        )}

                        {/* Custom model option */}
                        {!loadingModels && filteredGroups.length > 0 && (
                            <li className="border-t border-gray-100 mt-1 pt-1">
                                <button
                                    role="menuitem"
                                    onClick={() => setShowCustomInput(true)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${focusedIndex === flatModels.length ? 'bg-blue-50' : 'hover:bg-gray-50'
                                        }`}
                                >
                                    <Plus className="w-3.5 h-3.5 text-gray-500" />
                                    <span className="text-gray-600">Gunakan model custom...</span>
                                    <ExternalLink className="w-3 h-3 ml-auto text-gray-400" />
                                </button>
                            </li>
                        )}
                    </ul>

                    {/* Footer */}
                    {!loadingModels && (
                        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-xl text-[10px] text-gray-400 flex justify-between items-center">
                            <span>
                                {flatModels.length} model tersedia
                            </span>
                            {fetchedModels.length > 0 && (
                                <span className="text-emerald-500">● Dari database</span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Custom model input */}
            {open && showCustomInput && (
                <div className="absolute bottom-full left-0 mb-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72 p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Masukkan ID model custom</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={customModelValue}
                            onChange={(e) => setCustomModelValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCustomSubmit();
                                else if (e.key === 'Escape') {
                                    setShowCustomInput(false);
                                    setCustomModelValue('');
                                }
                            }}
                            placeholder="contoh: my-custom-model"
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleCustomSubmit}
                            disabled={!customModelValue.trim()}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${customModelValue.trim()
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            Pilih
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setShowCustomInput(false);
                            setCustomModelValue('');
                        }}
                        className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                        ← Kembali ke daftar model
                    </button>
                </div>
            )}
        </div>
    );
}
