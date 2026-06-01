'use client';

import { useState, useMemo } from 'react';
import { Search, Wrench, Filter, Check, X, Database, BarChart3, Users, Clock, DollarSign, Home, Calendar, Activity } from 'lucide-react';
import TOOL_REGISTRY, { getAllCategories, type ToolDisplayInfo } from '@/lib/ai/toolRegistry';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    Dashboard: <BarChart3 className="w-3.5 h-3.5" />,
    Marketing: <Users className="w-3.5 h-3.5" />,
    Operations: <Activity className="w-3.5 h-3.5" />,
    Finance: <DollarSign className="w-3.5 h-3.5" />,
    Occupancy: <Home className="w-3.5 h-3.5" />,
    Booking: <Calendar className="w-3.5 h-3.5" />,
    Customer: <Users className="w-3.5 h-3.5" />,
    Unit: <Home className="w-3.5 h-3.5" />,
    Expense: <DollarSign className="w-3.5 h-3.5" />,
    Billing: <Database className="w-3.5 h-3.5" />,
};

function Badge({ label, variant }: { label: string; variant?: 'blue' | 'emerald' | 'amber' | 'purple' | 'gray' }) {
    const cls = variant === 'blue' ? 'bg-blue-100 text-blue-700'
        : variant === 'emerald' ? 'bg-emerald-100 text-emerald-700'
            : variant === 'amber' ? 'bg-amber-100 text-amber-700'
                : variant === 'purple' ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600';
    return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{label}</span>;
}

export default function AIToolsTable() {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    const categories = useMemo(() => getAllCategories(), []);

    const filtered = useMemo(() => {
        let list = TOOL_REGISTRY;
        if (categoryFilter !== 'all') {
            list = list.filter(t => t.category === categoryFilter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(t =>
                t.name.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                t.bestFor.toLowerCase().includes(q) ||
                t.category.toLowerCase().includes(q)
            );
        }
        return list;
    }, [search, categoryFilter]);

    return (
        <div className="space-y-3">
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Cari tool..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                    <option value="all">Semua Kategori</option>
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            {/* Results count */}
            <p className="text-[10px] text-gray-500">
                {filtered.length} dari {TOOL_REGISTRY.length} tool
            </p>

            {/* Table */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Tool Name</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Category</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Capabilities</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Input Parameters</th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-700">Cached</th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-700">Composite</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Best For</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((tool, idx) => (
                            <tr key={tool.name} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30 transition-colors`}>
                                <td className="px-3 py-2.5 font-mono text-[11px] text-blue-700 font-medium whitespace-nowrap">{tool.name}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium">
                                        {CATEGORY_ICONS[tool.category]}
                                        {tool.category}
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-gray-600 max-w-[260px] leading-relaxed">{tool.description}</td>
                                <td className="px-3 py-2.5">
                                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                                        {tool.capabilities.map(cap => (
                                            <Badge key={cap} label={cap} variant={
                                                cap === 'Composite' ? 'purple'
                                                    : cap === 'Real-time' || cap === 'Live' ? 'emerald'
                                                        : cap === 'Comparison' ? 'blue'
                                                            : cap === 'Fast' ? 'amber'
                                                                : 'gray'
                                            } />
                                        ))}
                                    </div>
                                </td>
                                <td className="px-3 py-2.5">
                                    <code className="text-[10px] text-gray-500 font-mono whitespace-nowrap">
                                        {tool.inputParams.join(', ')}
                                    </code>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                    {tool.cached
                                        ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium"><Check className="w-2.5 h-2.5" />Ya</span>
                                        : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-medium"><X className="w-2.5 h-2.5" />Tidak</span>
                                    }
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                    {tool.composite
                                        ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-medium"><Check className="w-2.5 h-2.5" />Ya</span>
                                        : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-medium"><X className="w-2.5 h-2.5" />Tidak</span>
                                    }
                                </td>
                                <td className="px-3 py-2.5 text-gray-600 max-w-[200px] leading-relaxed">{tool.bestFor}</td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-500">
                                    Tidak ada tool yang cocok dengan filter &ldquo;{search}&rdquo;
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700 font-medium">ⓘ Tentang Tool KR·AI</summary>
                <div className="mt-2 space-y-1 pl-2">
                    <p><Badge label="Composite" variant="purple" /> = tool panel yang menggabungkan beberapa data sekaligus (prioritas utama)</p>
                    <p><Badge label="Real-time" variant="emerald" /> = data langsung dari database tanpa cache</p>
                    <p><Badge label="Cached" variant="emerald" /> = data di-cache untuk performa lebih cepat</p>
                    <p><Badge label="Fast" variant="amber" /> = tool tanpa parameter, respons cepat</p>
                    <p className="text-gray-400 mt-1">Semua tool bersifat <strong>read-only</strong>. Tidak ada modifikasi database.</p>
                </div>
            </details>
        </div>
    );
}
