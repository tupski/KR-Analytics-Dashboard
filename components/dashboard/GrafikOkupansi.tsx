'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import type { OccupancyDataPoint } from '@/types/dashboard';

interface GrafikOkupansiProps {
    data: OccupancyDataPoint[];
    period?: number; // days
    isLoading?: boolean;
}

/**
 * GrafikOkupansi - Occupancy Chart Component
 * 
 * Displays occupancy rate trends over time with area chart visualization.
 * Shows percentage of occupied units with color-coded indicators.
 * 
 * Features:
 * - Area chart with gradient fill
 * - Reference line at 80% occupancy threshold
 * - Color-coded line based on occupancy level
 * - Tooltip with detailed breakdown
 * - Smooth curve interpolation
 * - Loading and empty states
 * 
 */
export default function GrafikOkupansi({ data, period = 30, isLoading = false }: GrafikOkupansiProps) {
    // Format date for X-axis (Indonesian format)
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
        }).format(date);
    };

    // Format percentage for Y-axis
    const formatPercentage = (value: number) => {
        return `${value}%`;
    };

    // Determine line color based on average occupancy
    const getLineColor = () => {
        if (!data || data.length === 0) return '#2563eb';

        const avgOccupancy = data.reduce((sum, point) => sum + point.occupancyRate, 0) / data.length;

        if (avgOccupancy >= 80) return '#10b981'; // Green - high occupancy
        if (avgOccupancy >= 60) return '#f59e0b'; // Yellow - medium occupancy
        return '#ef4444'; // Red - low occupancy
    };

    // Custom tooltip component
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-semibold text-gray-900 mb-2">{formatDate(label)}</p>
                    <div className="space-y-1">
                        <p className="text-blue-600 font-medium">
                            Okupansi: {data.occupancyRate.toFixed(2)}%
                        </p>
                        <p className="text-gray-600 text-sm">
                            Unit Terisi: {data.occupiedUnits} / {data.totalUnits}
                        </p>
                    </div>
                </div>
            );
        }
        return null;
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="h-6 w-48 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="h-80 bg-gray-100 rounded animate-pulse"></div>
            </div>
        );
    }

    // Empty state
    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">Grafik Okupansi</h2>
                    <span className="text-sm text-gray-500">{period} hari terakhir</span>
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
                                d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                        <p className="mt-2 text-sm">Tidak ada data okupansi</p>
                    </div>
                </div>
            </div>
        );
    }

    const lineColor = getLineColor();

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Grafik Okupansi</h2>
                <span className="text-sm text-gray-500">{period} hari terakhir</span>
            </div>

            <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                        <linearGradient id="colorOccupancy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={lineColor} stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                        dataKey="date"
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                        tickFormatter={formatDate}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                    />
                    <YAxis
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                        tickFormatter={formatPercentage}
                        domain={[0, 100]}
                        ticks={[0, 20, 40, 60, 80, 100]}
                    />
                    <Tooltip content={<CustomTooltip />} />

                    {/* Reference line at 80% occupancy threshold */}
                    <ReferenceLine
                        y={80}
                        stroke="#10b981"
                        strokeDasharray="5 5"
                        label={{
                            value: 'Target 80%',
                            position: 'right',
                            fill: '#10b981',
                            fontSize: 12,
                        }}
                    />

                    <Area
                        type="monotone"
                        dataKey="occupancyRate"
                        stroke={lineColor}
                        strokeWidth={2}
                        fill="url(#colorOccupancy)"
                        dot={{ fill: lineColor, r: 3 }}
                        activeDot={{ r: 5 }}
                    />
                </AreaChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-gray-600">Tinggi (&ge;80%)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-gray-600">Sedang (60-79%)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-gray-600">Rendah (&lt;60%)</span>
                </div>
            </div>
        </div>
    );
}
