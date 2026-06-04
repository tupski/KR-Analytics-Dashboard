'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { RevenueDataPoint, RevenueFilter } from '@/types/dashboard';

interface GrafikPendapatanProps {
    initialData: RevenueDataPoint[];
    initialFilter: RevenueFilter;
}

interface ChartDataPoint {
    label: string;
    revenue: number;
    expense: number;
    transactionCount?: number;
}

/**
 * GrafikPendapatan - Revenue & Expense Comparison Chart
 *
 * Displays dual bar chart: Pendapatan (blue) and Pengeluaran (red).
 * Uses own filter independent from global dashboard filter.
 * Tooltip shows Pendapatan, Pengeluaran, and Selisih.
 */
export default function GrafikPendapatan({ initialData, initialFilter }: GrafikPendapatanProps) {
    const [filter, setFilter] = useState<RevenueFilter>(initialFilter);
    const [data, setData] = useState<RevenueDataPoint[]>(initialData);
    const [isPending, startTransition] = useTransition();

    // Derive chart data: merge revenue + expense
    // Use a ref to store latest chart data so expense fetch doesn't depend on state
    const [expenseData, setExpenseData] = useState<ChartDataPoint[]>(() =>
        initialData.map(r => ({
            label: r.label || r.date,
            revenue: r.revenue,
            expense: 0,
            transactionCount: r.transactionCount,
        }))
    );

    const filters: { value: RevenueFilter; label: string }[] = [
        { value: 'daily', label: 'Harian' },
        { value: 'weekly', label: 'Mingguan' },
        { value: 'monthly', label: 'Bulanan' },
        { value: 'yearly', label: 'Tahunan' },
    ];

    // Merge expenses into chart data with flexible date matching
    // For daily: exact date match. For weekly/monthly: match by YYYY-MM prefix.
    // For yearly: match by YYYY prefix.
    const mergeExpenses = useCallback((revData: RevenueDataPoint[], expenses: { date: string; amount: number }[]): ChartDataPoint[] => {
        if (expenses.length === 0) {
            return revData.map(r => ({
                label: r.label || r.date,
                revenue: r.revenue,
                expense: 0,
                transactionCount: r.transactionCount,
            }));
        }
        const expenseMap = new Map(expenses.map(e => [e.date, e.amount]));
        const isYearly = revData.length > 0 && /^\d{4}$/.test(revData[0].date);

        return revData.map(r => {
            let expense = 0;
            if (isYearly) {
                // Yearly: match expense entries with same year prefix "2026"
                for (const [d, amt] of expenseMap) {
                    if (d.startsWith(r.date)) { expense += amt; }
                }
            } else {
                // Daily/Weekly/Monthly: try exact match first, then YYYY-MM prefix
                expense = expenseMap.get(r.date) || 0;
                if (!expense && r.date.length >= 7) {
                    const prefix = r.date.substring(0, 7); // YYYY-MM
                    for (const [d, amt] of expenseMap) {
                        if (d.startsWith(prefix)) { expense += amt; }
                    }
                }
            }
            return {
                label: r.label || r.date,
                revenue: r.revenue,
                expense,
                transactionCount: r.transactionCount,
            };
        });
    }, []);

    // Helper: map RevenueFilter to expense groupBy
    const getGroupBy = useCallback((f: RevenueFilter): 'day' | 'month' => {
        if (f === 'daily' || f === 'weekly') return 'day';
        return 'month';
    }, []);

    // Fetch expenses when revenue data changes
    const updateChartData = useCallback(async (revData: RevenueDataPoint[], currentFilter: RevenueFilter) => {
        if (revData.length === 0) {
            setExpenseData([]);
            return;
        }
        const startDate = revData[0].date;
        const endDate = revData[revData.length - 1].date;
        const groupBy = getGroupBy(currentFilter);
        try {
            const { getExpenseTrendAction } = await import('@/app/(dashboard)/dashboard/actions');
            const expenses = await getExpenseTrendAction(startDate, endDate, groupBy);
            setExpenseData(mergeExpenses(revData, expenses));
        } catch {
            setExpenseData(mergeExpenses(revData, []));
        }
    }, [getGroupBy, mergeExpenses]);

    // Initial load + reload when filter changes (data updated)
    useEffect(() => {
        updateChartData(data, filter);
    }, [data, filter, updateChartData]);

    const handleFilterChange = async (newFilter: RevenueFilter) => {
        if (newFilter === filter) return;
        setFilter(newFilter);

        startTransition(async () => {
            try {
                const { fetchRevenueData } = await import('@/app/(dashboard)/dashboard/actions');
                const newData = await fetchRevenueData(newFilter);
                setData(newData);
                // Expenses will load via useEffect([data, filter])
            } catch (error) {
                console.error('Error fetching revenue data:', error);
            }
        });
    };

    // Format currency for Y-axis
    const formatAxisCurrency = (value: number) => {
        if (value >= 1_000_000_000) {
            return `Rp ${(value / 1_000_000_000).toFixed(1)} Miliar`;
        }
        if (value >= 1_000_000) {
            const jt = value / 1_000_000;
            return `Rp ${jt.toFixed(1)} Jt`;
        }
        if (value >= 1_000) {
            return `Rp ${(value / 1_000).toFixed(0)}rb`;
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

    // Custom tooltip with Pendapatan + Pengeluaran + Selisih
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const rev = payload.find((p: any) => p.dataKey === 'revenue')?.value || 0;
            const exp = payload.find((p: any) => p.dataKey === 'expense')?.value || 0;
            const selisih = rev - exp;
            return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-semibold text-gray-900 mb-1">{label}</p>
                    <p className="text-blue-600 font-medium">
                        Pendapatan: {formatTooltipCurrency(rev)}
                    </p>
                    <p className="text-red-600 font-medium">
                        Pengeluaran: {formatTooltipCurrency(exp)}
                    </p>
                    <p className={`font-medium mt-1 ${selisih >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Selisih: {formatTooltipCurrency(Math.abs(selisih))} ({selisih >= 0 ? 'Laba' : 'Rugi'})
                    </p>
                </div>
            );
        }
        return null;
    };

    // Show empty state
    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Grafik Pendapatan</h2>
                    <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                        {filters.map((f) => (
                            <button
                                key={f.value}
                                onClick={() => handleFilterChange(f.value)}
                                disabled={isPending}
                                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${filter === f.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-center h-64 sm:h-80 text-gray-500">
                    <div className="text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <p className="mt-2 text-sm">Tidak ada data pendapatan</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Grafik Pendapatan & Pengeluaran</h2>
                <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                    {filters.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => handleFilterChange(f.value)}
                            disabled={isPending}
                            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${filter === f.value
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
                    <BarChart data={expenseData.length > 0 ? expenseData : data.map(r => ({ label: r.label || r.date, revenue: r.revenue, expense: 0 }))} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                            tickFormatter={formatAxisCurrency}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '14px' }} />
                        <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} name="Pendapatan" />
                        <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name="Pengeluaran" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
