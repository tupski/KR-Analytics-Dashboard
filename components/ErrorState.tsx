'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    isRetrying?: boolean;
}

/**
 * ErrorState - Reusable Error State Component
 * 
 * Displays error messages with optional retry functionality.
 * Used across dashboard components for consistent error handling.
 * 
 * Features:
 * - User-friendly error messages in Indonesian
 * - Optional retry button
 * - Loading state during retry
 * - Consistent styling
 * 
 * Requirements: 7.8, 8.3, 8.4, 8.5
 */
export default function ErrorState({
    title = 'Gagal Memuat Data',
    message = 'Terjadi kesalahan saat memuat data. Silakan coba lagi.',
    onRetry,
    isRetrying = false,
}: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-red-600" />
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {title}
            </h3>

            <p className="text-sm text-gray-600 mb-4 max-w-sm">
                {message}
            </p>

            {onRetry && (
                <button
                    onClick={onRetry}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? 'Mencoba Lagi...' : 'Coba Lagi'}
                </button>
            )}
        </div>
    );
}
