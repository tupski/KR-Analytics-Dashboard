/**
 * ModelFetchButton Component
 * 
 * Button that fetches available models from an AI provider's API
 * and stores them in the database for selection.
 */

'use client';

import { useState } from 'react';
import { Download, Loader2, Check, AlertCircle } from 'lucide-react';
import { fetchModels } from '@/lib/ai/modelClient';
import type { ProviderModel } from '@/types/ai-models';

interface ModelFetchButtonProps {
    /** Provider ID (e.g., 'openai', 'google', 'anthropic') */
    providerId: string;
    /** Callback when models are successfully fetched */
    onSuccess?: (models: ProviderModel[]) => void;
    /** Optional custom button text */
    buttonText?: string;
    /** Button size variant */
    size?: 'sm' | 'md';
}

/**
 * ModelFetchButton fetches models from provider API
 * 
 * Displays a button that triggers model fetching from the provider's API.
 * Shows loading state during fetch and displays success/error messages.
 * 
 * @param providerId - Provider slug to fetch models from
 * @param onSuccess - Optional callback when fetch succeeds
 * @param buttonText - Optional custom button text (default: "Ambil Model")
 * @param size - Button size (sm or md, default: md)
 */
export default function ModelFetchButton({
    providerId,
    onSuccess,
    buttonText = 'Ambil Model',
    size = 'md',
}: ModelFetchButtonProps) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleFetch = async () => {
        setLoading(true);
        setMessage(null);

        try {
            const result = await fetchModels(providerId);

            if (result.success) {
                setMessage({
                    type: 'success',
                    text: `Berhasil mengambil ${result.models.length} model dari provider`,
                });

                // Call success callback if provided
                if (onSuccess) {
                    onSuccess(result.models);
                }

                // Clear success message after 3 seconds
                setTimeout(() => setMessage(null), 3000);
            } else {
                setMessage({
                    type: 'error',
                    text: result.error || 'Gagal mengambil model dari provider',
                });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Terjadi kesalahan saat mengambil model',
            });
        } finally {
            setLoading(false);
        }
    };

    const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm';

    return (
        <div className="space-y-2">
            <button
                onClick={handleFetch}
                disabled={loading}
                className={`inline-flex items-center gap-2 rounded-lg font-medium transition-colors ${sizeClasses} ${loading
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                    }`}
                aria-label={loading ? 'Mengambil model...' : buttonText}
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengambil...</span>
                    </>
                ) : (
                    <>
                        <Download className="w-4 h-4" />
                        <span>{buttonText}</span>
                    </>
                )}
            </button>

            {/* Success/Error Message */}
            {message && (
                <div
                    className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${message.type === 'success'
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                    role="alert"
                >
                    {message.type === 'success' ? (
                        <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    ) : (
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    )}
                    <p>{message.text}</p>
                </div>
            )}
        </div>
    );
}
