/**
 * ModelDropdown Component
 * 
 * A searchable dropdown/combobox for selecting AI models from a provider.
 * Supports keyboard navigation, filtering, and custom model input.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Loader2, AlertCircle, Search, Plus, ExternalLink } from 'lucide-react';
import { getModels } from '@/lib/ai/modelClient';
import ModelBadge, { BadgeType } from './ModelBadge';
import type { ProviderModel } from '@/types/ai-models';

interface ModelDropdownProps {
    /** Provider ID (e.g., 'openai', 'google', 'anthropic') */
    providerId: string;
    /** Currently selected model ID */
    value: string;
    /** Callback when selection changes */
    onChange: (modelId: string) => void;
    /** Placeholder text when no selection */
    placeholder?: string;
    /** Disabled state */
    disabled?: boolean;
}

/**
 * Format relative time in Indonesian
 */
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

/**
 * Map model capabilities to badge types
 */
function getBadgesForModel(model: ProviderModel): BadgeType[] {
    const badges: BadgeType[] = [];
    const caps = model.capabilities || {};

    if (caps.vision) badges.push('vision');
    if (caps.reasoning) badges.push('reasoning');
    if (caps.functionCalling) badges.push('coding');

    // Infer free/pro from pricing if available
    if (model.pricing) {
        const inputPrice = model.pricing.input ?? 0;
        if (inputPrice === 0) badges.push('free');
        else badges.push('pro');
    }

    // Check display name for flash models
    const name = model.displayName.toLowerCase();
    if (name.includes('flash') || name.includes('turbo') || name.includes('fast')) {
        badges.push('flash');
    }

    return badges;
}

/**
 * ModelDropdown - searchable dropdown for AI model selection
 * 
 * Features:
 * - Search/filter by model ID or display name
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Model capability badges
 * - Custom model input option
 * - Loading, empty, and error states
 * - Last fetched timestamp display
 * 
 * @param providerId - Provider slug to load models from
 * @param value - Currently selected model ID
 * @param onChange - Callback when selection changes
 * @param placeholder - Placeholder text
 * @param disabled - Disabled state
 */
export default function ModelDropdown({
    providerId,
    value,
    onChange,
    placeholder = 'Pilih model...',
    disabled = false,
}: ModelDropdownProps) {
    const [models, setModels] = useState<ProviderModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetched, setLastFetched] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customModelValue, setCustomModelValue] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Load models on mount and when provider changes
    useEffect(() => {
        async function loadModels() {
            setLoading(true);
            setError(null);

            try {
                const response = await getModels(providerId);
                setModels(response.models || []);
                setLastFetched(response.lastFetched || null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Gagal memuat model');
            } finally {
                setLoading(false);
            }
        }

        loadModels();
    }, [providerId]);

    // Filter models based on search query
    const filteredModels = models.filter((model) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            model.modelId.toLowerCase().includes(query) ||
            model.displayName.toLowerCase().includes(query)
        );
    });

    // Find selected model
    const selectedModel = models.find((m) => m.modelId === value);

    // Handle click outside to close dropdown
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

    // Focus input when dropdown opens
    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    // Scroll focused item into view
    useEffect(() => {
        if (listRef.current && focusedIndex >= 0) {
            const focusedElement = listRef.current.children[focusedIndex] as HTMLElement;
            if (focusedElement) {
                focusedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [focusedIndex]);

    // Handle keyboard navigation
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

            const totalItems = filteredModels.length + 1; // +1 for custom option

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
                    if (focusedIndex >= 0 && focusedIndex < filteredModels.length) {
                        const selected = filteredModels[focusedIndex];
                        onChange(selected.modelId);
                        setOpen(false);
                        setSearchQuery('');
                    } else if (focusedIndex === filteredModels.length) {
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
        [open, focusedIndex, filteredModels, onChange]
    );

    // Handle custom model submission
    const handleCustomModelSubmit = () => {
        if (customModelValue.trim()) {
            onChange(customModelValue.trim());
            setShowCustomInput(false);
            setCustomModelValue('');
            setOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => {
                    if (!disabled) {
                        setOpen(!open);
                    }
                }}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border rounded-lg transition-colors ${disabled
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : open
                        ? 'border-blue-500 ring-2 ring-blue-100 bg-white'
                        : 'border-gray-300 hover:border-gray-400 bg-white'
                    }`}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Pilih model AI"
            >
                {loading ? (
                    <span className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Memuat model...
                    </span>
                ) : selectedModel ? (
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium text-gray-900">{selectedModel.displayName}</span>
                        <span className="text-xs text-gray-500 truncate">({selectedModel.modelId})</span>
                    </div>
                ) : (
                    <span className="text-gray-500">{placeholder}</span>
                )}
                {open ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
            </button>

            {/* Dropdown Panel */}
            {open && !showCustomInput && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                    {/* Search Input */}
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
                                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                aria-label="Cari model"
                            />
                        </div>
                    </div>

                    {/* Model List */}
                    <ul
                        ref={listRef}
                        className="max-h-64 overflow-y-auto py-1"
                        role="listbox"
                        aria-label="Daftar model AI"
                    >
                        {loading ? (
                            <li className="px-3 py-8 text-center text-gray-500 text-sm">
                                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                Memuat model...
                            </li>
                        ) : error ? (
                            <li className="px-3 py-4 text-center text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 mx-auto mb-1" />
                                {error}
                            </li>
                        ) : filteredModels.length === 0 ? (
                            <li className="px-3 py-6 text-center text-gray-500 text-sm">
                                {searchQuery ? (
                                    <>
                                        <p>Tidak ada model yang cocok dengan &quot;{searchQuery}&quot;</p>
                                    </>
                                ) : (
                                    <>
                                        <p>Tidak ada model.</p>
                                        <p className="text-xs mt-1 text-gray-400">
                                            Klik &quot;Ambil Model&quot; untuk mengambil dari provider.
                                        </p>
                                    </>
                                )}
                            </li>
                        ) : (
                            filteredModels.map((model, index) => {
                                const isSelected = model.modelId === value;
                                const isFocused = index === focusedIndex;
                                const badges = getBadgesForModel(model);

                                return (
                                    <li
                                        key={model.modelId}
                                        role="option"
                                        aria-selected={isSelected}
                                        className={`px-3 py-2 cursor-pointer transition-colors ${isFocused ? 'bg-blue-50' : ''
                                            } ${isSelected ? 'bg-blue-100' : ''} hover:bg-gray-50`}
                                        onClick={() => {
                                            onChange(model.modelId);
                                            setOpen(false);
                                            setSearchQuery('');
                                        }}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900 truncate">
                                                        {model.displayName}
                                                    </span>
                                                    {isSelected && (
                                                        <span className="text-blue-600 text-xs">✓</span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-gray-500 truncate block">
                                                    {model.modelId}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1 flex-shrink-0">
                                                {badges.map((badge) => (
                                                    <ModelBadge key={badge} type={badge} size="xs" />
                                                ))}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })
                        )}

                        {/* Custom Model Option */}
                        {!loading && !error && (
                            <li
                                className={`px-3 py-2 cursor-pointer border-t border-gray-100 transition-colors ${focusedIndex === filteredModels.length ? 'bg-blue-50' : ''
                                    } hover:bg-gray-50`}
                                role="menuitem"
                                onClick={() => setShowCustomInput(true)}
                            >
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Gunakan model custom...</span>
                                    <ExternalLink className="w-3 h-3 ml-auto text-gray-400" />
                                </div>
                            </li>
                        )}
                    </ul>

                    {/* Footer - Model count and last fetched */}
                    {!loading && !error && (
                        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg text-xs text-gray-500 flex justify-between items-center">
                            <span>{filteredModels.length} dari {models.length} model tersedia</span>
                            <span>Terakhir diambil: {formatRelativeTime(lastFetched)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Custom Model Input */}
            {open && showCustomInput && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Masukkan ID model custom</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={customModelValue}
                            onChange={(e) => setCustomModelValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleCustomModelSubmit();
                                } else if (e.key === 'Escape') {
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
                            onClick={handleCustomModelSubmit}
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
