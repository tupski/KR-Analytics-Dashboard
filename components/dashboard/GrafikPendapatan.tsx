'use client';

import { useState, useTransition } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { RevenueDataPoint, RevenueFilter } from '@/types/dashboard';

interface GrafikPendapatanProps {
    initialData: RevenueDataPoint[];
    initialFilter: RevenueFilter;
}

/**
 * GrafikPendapatan - Revenue Chart Component
 * 
 * Interactive revenue chart with time period filters (daily, weekly, monthly, yearly).
 * Displays revenue trends using Recharts with Indonesian Rupiah formatting.
 * 
 * Features:
 * - Filter buttons for different time periods
 * - Responsive chart with formatted axes
 * - Tooltip with detailed information
 * - Loading states during data fetch
 * - Empty state when no data exists
 * 
 */
export default function GrafikPendapatan({ initialData, initialFilter }: GrafikPendapatanProps) {
    const [filter, setFilter] = useState<RevenueFilter>(initialFilter);
    const [data, setData] = useState<RevenueDataPoint[]>(initialData);
    const [isPending, startTransition] = useTransition();

    const filters: { value: RevenueFilter; label: string }[] = [
        { value: 'daily', label: 'Harian' },
        { value: 'weekly', label: 'Mingguan' },
        { value: 'monthly', label: 'Bulanan' },
        { value: 'yearly', label: 'Tahunan' },
    ];

    const handleFilterChange = async (newFilter: RevenueFilter) => {
        if (newFilter === filter) return;

        setFilter(newFilter);

        startTransition(async () => {
            try {
                // Import server action dynamically to avoid bundling server code
                const { fetchRevenueData } = await import('@/app/dashboard/actions');
                const newData = await fetchRevenueData(newFilter);
                setData(newData);
            } catch (error) {
                console.error('Error fetching revenue data:', error);
                // Keep existing data on error
            }
        });
    };

    // Format currency for Y-axis
    const formatCurrency = (value: number) => {
        if (value >= 1000000) {
            return `Rp ${(value / 1000000).toFixed(1)}jt`;
        } else if (value >= 1000) {
            return `Rp ${(value / 1000).toFixed(0)}rb`;
        }
        return `Rp ${value}`;
    };

    // Format currency for tooltip
    const formatTooltipCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    // Custom tooltip component
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-semibold text-gray-900 mb-1">{label}</p>
                    <p className="text-blue-600 font-medium">
                        Pendapatan: {formatTooltipCurrency(payload[0].value)}
                    </p>
                    {payload[0].payload.transactionCount !== undefined && (
                        <p className="text-gray-600 text-sm">
                            Transaksi: {payload[0].payload.transactionCount}
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    // Show empty state
    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">Grafik Pendapatan</h2>
                    <div className="flex gap-2">
                        {filters.map((f) => (
                            <button
                                key={f.value}
                                onClick={() => handleFilterChange(f.value)}
                                disabled={isPending}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === f.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-center h-80 text-gray-500">
                    <div className="text-center">
                        <svg
                            className="mx-auto h-12 w-12 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                        </svg>
                        <p className="mt-2 text-sm">Tidak ada data pendapatan</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
                <h2 className="text-lg font-semibold text-gray-900">Grafik Pendapatan</h2>
                <div className="flex gap-2 flex-wrap">
                    {filters.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => handleFilterChange(f.value)}
                            disabled={isPending}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === f.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {isPending && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            )}

            <div className="relative">
                <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                            dataKey="label"
                            stroke="#6b7280"
                            style={{ fontSize: '12px' }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                        />
                        <YAxis
                            stroke="#6b7280"
                            style={{ fontSize: '12px' }}
                            tickFormatter={formatCurrency}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{ fontSize: '14px' }}
                            formatter={() => 'Pendapatan'}
                        />
                        <Bar
                            dataKey="revenue"
                            fill="#2563eb"
                            radius={[4, 4, 0, 0]}
                            name="Pendapatan"
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
