'use client';

import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type {
    GuestSourceSummary,
    OccupancyPerUnit,
    StayDurationSummary,
    RepeatGuest,
} from '@/lib/analytics/types';
import { formatDateValue, formatChartDate } from '@/lib/utils/date-format';

// ─── Props ───────────────────────────────────────────────────────────

interface AnalyticsChartsProps {
    guestSourceSummary: GuestSourceSummary[];
    occupancyPerUnit: OccupancyPerUnit[];
    stayDurationSummary: StayDurationSummary[];
    repeatGuests: RepeatGuest[];
    periodLabel: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatIDR(value: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

function formatPercent(value: number): string {
    return value.toFixed(1) + '%';
}



// ─── Custom Tooltips ─────────────────────────────────────────────────

function GuestSourceTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-xs">
            <p className="font-semibold text-gray-900 mb-1">{label}</p>
            <p className="text-blue-600">Pendapatan: {formatIDR(d.total_revenue)}</p>
            <p className="text-gray-600">Persentase: {formatPercent(d.percentage)}</p>
        </div>
    );
}

function OccupancyUnitTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-xs">
            <p className="font-semibold text-gray-900 mb-1">{label}</p>
            <p className="text-blue-600">Pendapatan: {formatIDR(d.total_revenue)}</p>
            <p className="text-gray-600">Tingkat Hunian: {d.occupancy_rate != null ? formatPercent(d.occupancy_rate) : '—'}</p>
        </div>
    );
}

function StayDurationTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-xs">
            <p className="font-semibold text-gray-900 mb-1">{label}</p>
            <p className="text-blue-600">Transaksi: {d.transaction_count}</p>
            <p className="text-gray-600">Persentase: {formatPercent(d.percentage)}</p>
            <p className="text-gray-600">Pendapatan: {formatIDR(d.total_revenue)}</p>
        </div>
    );
}

// ─── Colors ──────────────────────────────────────────────────────────

const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// ─── Empty State ─────────────────────────────────────────────────────

function EmptyState({ message = 'Belum ada data pada periode ini' }: { message?: string }) {
    return (
        <div className="flex items-center justify-center h-48 sm:h-64 text-gray-500">
            <div className="text-center">
                <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="mt-2 text-sm">{message}</p>
            </div>
        </div>
    );
}

// ─── Section wrapper ─────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
            {children}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function AnalyticsCharts({
    guestSourceSummary,
    occupancyPerUnit,
    stayDurationSummary,
    repeatGuests,
    periodLabel,
}: AnalyticsChartsProps) {
    return (
        <div className="space-y-6">
            {/* ════════════════════════════════════════════════════════
                SECTION 2: Peringkat Marketing
            ════════════════════════════════════════════════════════ */}
            <SectionCard title="Peringkat Marketing">
                {guestSourceSummary.length === 0 ? (
                    <EmptyState />
                ) : (
                    <>
                        {/* Horizontal BarChart */}
                        <div className="mb-6">
                            <ResponsiveContainer width="100%" height={Math.max(200, guestSourceSummary.length * 45)}>
                                <BarChart
                                    data={guestSourceSummary}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis
                                        type="number"
                                        stroke="#6b7280"
                                        style={{ fontSize: '11px' }}
                                    />
                                    <YAxis
                                        dataKey="source_name"
                                        type="category"
                                        stroke="#6b7280"
                                        style={{ fontSize: '11px' }}
                                        width={120}
                                    />
                                    <Tooltip content={<GuestSourceTooltip />} />
                                    <Bar dataKey="transaction_count" fill="#2563eb" radius={[0, 4, 4, 0]} name="Transaksi" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Data Table */}
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600">Sumber</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600">Transaksi</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600">Pendapatan</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600">Persentase</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {guestSourceSummary.map((row, i) => (
                                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.source_name}</td>
                                            <td className="px-3 py-2 text-right text-gray-700">
                                                {row.transaction_count.toLocaleString('id-ID')}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-700">
                                                {formatIDR(row.total_revenue)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-700">
                                                {formatPercent(row.percentage)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </SectionCard>

            {/* ════════════════════════════════════════════════════════
                SECTION 4: Laporan Hunian
            ════════════════════════════════════════════════════════ */}
            <SectionCard title="Laporan Hunian">
                <div className="space-y-8">
                    {/* ── 4a. Occupancy Per Unit ── */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Tingkat Hunian per Unit</h4>
                        {occupancyPerUnit.length === 0 ? (
                            <EmptyState />
                        ) : (
                            <ResponsiveContainer width="100%" height={Math.max(200, occupancyPerUnit.length * 45)}>
                                <BarChart
                                    data={occupancyPerUnit}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis type="number" stroke="#6b7280" style={{ fontSize: '11px' }} />
                                    <YAxis
                                        dataKey="room_number"
                                        type="category"
                                        stroke="#6b7280"
                                        style={{ fontSize: '11px' }}
                                        width={80}
                                    />
                                    <Tooltip content={<OccupancyUnitTooltip />} />
                                    <Bar dataKey="transaction_count" fill="#2563eb" radius={[0, 4, 4, 0]} name="Transaksi" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* ── 4b. Stay Duration ── */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Durasi Menginap</h4>
                        {stayDurationSummary.length === 0 ? (
                            <EmptyState />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* PieChart */}
                                <ResponsiveContainer width="100%" height={280}>
                                    <PieChart>
                                        <Pie
                                            data={stayDurationSummary}
                                            dataKey="transaction_count"
                                            nameKey="duration_category"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={100}
                                            innerRadius={50}
                                            label={({ duration_category, percentage }) =>
                                                `${duration_category} (${formatPercent(percentage)})`
                                            }
                                            labelLine
                                        >
                                            {stayDurationSummary.map((_, index) => (
                                                <Cell
                                                    key={index}
                                                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<StayDurationTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>

                                {/* Table */}
                                <div className="overflow-x-auto rounded-lg border border-gray-200 self-start">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium text-gray-600">Kategori</th>
                                                <th className="px-3 py-2 text-right font-medium text-gray-600">Transaksi</th>
                                                <th className="px-3 py-2 text-right font-medium text-gray-600">Persentase</th>
                                                <th className="px-3 py-2 text-right font-medium text-gray-600">Pendapatan</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {stayDurationSummary.map((row, i) => (
                                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                                        {row.duration_category}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-700">
                                                        {row.transaction_count.toLocaleString('id-ID')}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-700">
                                                        {formatPercent(row.percentage)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-700">
                                                        {formatIDR(row.total_revenue)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── 4c. Repeat Guests ── */}
                    <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Tamu Berulang</h4>
                        {repeatGuests.length === 0 ? (
                            <EmptyState message="Belum ada tamu berulang pada periode ini" />
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-gray-600">Nama Tamu</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600">Kunjungan</th>
                                            <th className="px-3 py-2 text-right font-medium text-gray-600">Total Pendapatan</th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600">Kunjungan Pertama</th>
                                            <th className="px-3 py-2 text-center font-medium text-gray-600">Kunjungan Terakhir</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {repeatGuests.map((row, i) => (
                                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-medium">
                                                    {row.customer_name}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700">
                                                    {row.visit_count}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-700">
                                                    {formatIDR(row.total_revenue)}
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">
                                                    {formatDateValue(row.first_visit)}
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">
                                                    {formatDateValue(row.last_visit)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
