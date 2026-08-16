'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error?: Error;
}

/**
 * ChartErrorBoundary - Lightweight Error Boundary for Chart Components
 * 
 * Provides graceful error handling for individual chart components.
 * Shows a compact error message instead of crashing the entire dashboard.
 * 
 * Usage:
 * <ChartErrorBoundary fallbackTitle="Revenue Chart">
 *   <GrafikPendapatan {...props} />
 * </ChartErrorBoundary>
 */
export default class ChartErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`Chart error in ${this.props.fallbackTitle || 'component'}:`, error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
                    <div className="flex items-center gap-3 text-red-600 mb-2">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <h3 className="font-semibold">
                            {this.props.fallbackTitle ? `Error loading ${this.props.fallbackTitle}` : 'Error loading chart'}
                        </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                        Terjadi kesalahan saat memuat komponen ini. Silakan refresh halaman atau hubungi administrator.
                    </p>
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <div className="bg-red-50 rounded p-3 border border-red-100">
                            <p className="text-xs font-mono text-red-700 break-all">
                                {this.state.error.message}
                            </p>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
