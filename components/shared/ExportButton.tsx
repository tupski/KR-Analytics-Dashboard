'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

interface ExportButtonProps {
    page: string;
    filterParams?: Record<string, string>;
    label?: string;
}

export default function ExportButton({ page, filterParams, label = 'Export XLSX' }: ExportButtonProps) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            // Collect filter params from URL search params or provided params
            const params = new URLSearchParams(filterParams || window.location.search);
            const res = await fetch(`/api/export/${page}?${params}`);

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Export gagal' }));
                alert(err.error || 'Export gagal. Silakan cek log server.');
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kr-analytics-${page}-${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
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
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
        >
            {loading ? (
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
