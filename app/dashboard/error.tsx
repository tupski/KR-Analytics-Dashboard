'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Dashboard Error Page
 * 
 * Catches errors in the dashboard page and displays a user-friendly error message.
 * Provides options to retry or return to home.
 * 
 * Requirements: 7.8, 8.3, 8.4, 8.5
 */
export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log error to console (in production, send to error tracking service)
        console.error('Dashboard error:', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full">
                <div className="text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-600" />
                    </div>

                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Gagal Memuat Dashboard
                    </h1>

                    <p className="text-gray-600 mb-6">
                        Terjadi kesalahan saat memuat data dashboard. Ini mungkin disebabkan oleh masalah koneksi atau server yang sedang sibuk.
                    </p>

                    {process.env.NODE_ENV === 'development' && (
                        <div className="bg-gray-100 rounded-lg p-4 mb-6 text-left">
                            <p className="text-xs font-mono text-gray-700 break-all">
                                {error.message}
                            </p>
                            {error.digest && (
                                <p className="text-xs text-gray-500 mt-2">
                                    Error ID: {error.digest}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={reset}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Coba Lagi
                        </button>

                        <Link
                            href="/dashboard"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <Home className="w-4 h-4" />
                            Kembali ke Beranda
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
