'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { exportToXLSX, type ExportSheet } from '@/lib/export/xlsx';

interface ExportButtonProps {
    onExport: () => Promise<{ sheets: ExportSheet[]; filename: string }>;
    loading?: boolean;
    label?: string;
}

export default function ExportButton({ onExport, loading: externalLoading = false, label = 'Export XLSX' }: ExportButtonProps) {
    const [loading, setLoading] = useState(false);

    const isLoading = loading || externalLoading;

    const handleClick = async () => {
        setLoading(true);
        try {
            const { sheets, filename } = await onExport();
            exportToXLSX(sheets, filename);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Gagal melakukan export. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
        >
            {isLoading ? (
                <>
                    <span className="animate-spin text-base">⏳</span>
                    <span className="hidden sm:inline">Mengekspor...</span>
                </>
            ) : (
                <>
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                </>
            )}
        </button>
    );
}
