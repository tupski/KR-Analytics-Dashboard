'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
import type { OccupancyDataPoint } from '@/types/dashboard';

interface GrafikOkupansiProps {
    data: OccupancyDataPoint[];
    period?: number;
    isLoading?: boolean;
}

/** Color per occupancy level */
function barColor(rate: number): string {
    if (rate >= 80) return '#10b981'; // emerald-500 — Tinggi
    if (rate >= 50) return '#f59e0b'; // amber-500  — Sedang
    return '#ef4444';                 // red-500    — Rendah
}

function levelLabel(rate: number): string {
    if (rate >= 80) return 'Tinggi';
    if (rate >= 50) return 'Sedang';
    return 'Rendah';
}

const formatDate = (d: string) =>
    new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(d));

const formatPct = (v: number) => `${v}%`;

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload as OccupancyDataPoint;
    const color = barColor(point.occupancyRate);
    return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
            <p className="font-semibold text-gray-900 mb-1">{formatDate(label)}</p>
            <p style={{ color }} className="font-medium">
                Tingkat Hunian: {point.occupancyRate.toFixed(1)}% ({levelLabel(point.occupancyRate)})
            </p>
            <p className="text-gray-600 mt-0.5">
                Kamar Terisi: <strong>{point.occupiedUnits}</strong> dari {point.totalUnits} kamar
            </p>
        </div>
    );
}

export default function GrafikOkupansi({ data, period = 30, isLoading = false }: GrafikOkupansiProps) {
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-6" />
                <div className="h-72 bg-gray-100 rounded animate-pulse" />
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Okupansi Harian</h2>
                    <span className="text-xs sm:text-sm text-gray-500">{period} hari terakhir</span>
                </div>
                <div className="flex items-center justify-center h-64 text-gray-400">
                    <p className="text-sm">Belum ada data hunian untuk periode ini.</p>
                </div>
            </div>
        );
    }

    // NOTE: This component now shows TRUE daily occupancy via getDailyOccupancyTrend().
    // A room is "occupied" on a given day if checkin_at <= end of that day AND
    // checkout_at >= start of that day. Multi-day stays count on every day of the stay,
    // not just the check-in date.
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Okupansi Harian</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Kamar yang terisi berdasarkan masa inap (check-in s/d check-out)</p>
                </div>
                <span className="text-xs text-gray-500">{period} hari terakhir</span>
            </div>

            <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 40 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        angle={-45}
                        textAnchor="end"
                        height={56}
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        interval={Math.max(0, Math.floor(data.length / 8) - 1)}
                    />
                    <YAxis
                        tickFormatter={formatPct}
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tick={{ fontSize: 10, fill: '#6b7280' }}
                        width={38}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />

                    {/* Target line at 80% */}
                    <ReferenceLine
                        y={80}
                        stroke="#10b981"
                        strokeDasharray="5 5"
                        strokeWidth={1.5}
                        label={{ value: 'Target 80%', position: 'right', fill: '#10b981', fontSize: 10 }}
                    />

                    <Bar dataKey="occupancyRate" name="Tingkat Hunian" radius={[3, 3, 0, 0]}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={barColor(entry.occupancyRate)} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-emerald-500" />
                    <span>Tinggi (≥80%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-amber-500" />
                    <span>Sedang (50–79%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span>Rendah (&lt;50%)</span>
                </div>
            </div>
        </div>
    );
}
