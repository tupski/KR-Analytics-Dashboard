import { fetchLaporanData, fetchHighOccupancyLocations, fetchAllExpenses } from './actions';
import type { DateFilter } from './actions';
import AIInsightCard from '@/components/ai/AIInsightCard';
import LaporanClient from '@/components/laporan/LaporanClient';
import ReportPeriodChip from '@/components/shared/ReportPeriodChip';
import ExportButton from '@/components/shared/ExportButton';
import { exportToXLSX, getExportFilename, currencyCol, dateCol, type ExportSheet } from '@/lib/export/xlsx';

export default async function LaporanPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const filter = (typeof params.filter === 'string' ? params.filter : 'today') as DateFilter;

    const [data, highOccupancy] = await Promise.all([
        fetchLaporanData(filter),
        fetchHighOccupancyLocations(30),
    ]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Laporan</h1>
                        <p className="mt-1 text-xs sm:text-sm text-gray-500">Laporan keuangan & operasional</p>
                    </div>
                    <ReportPeriodChip className="hidden sm:inline-flex mt-1 flex-shrink-0" />
                </div>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* Export Button */}
                <div className="flex justify-end mb-2">
                    <ExportButton
                        onExport={async () => {
                            'use server';
                            const [expenses] = await Promise.all([
                                fetchAllExpenses(filter),
                            ]);

                            const sheets: ExportSheet[] = [
                                {
                                    name: 'Pengeluaran',
                                    columns: [
                                        {
                                            header: 'Tanggal', key: 'tanggal', format: (v: string) => {
                                                try { return new Date(v + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return v; }
                                            }
                                        },
                                        { header: 'Kategori', key: 'category' },
                                        { header: 'Nama Pengeluaran', key: 'namaPengeluaran' },
                                        { header: 'Jumlah', key: 'jumlah', format: (v: number) => `Rp ${v.toLocaleString('id-ID')}` },
                                        { header: 'Lokasi', key: 'apartmentLocation' },
                                        { header: 'Keterangan', key: 'keterangan' },
                                    ],
                                    data: expenses,
                                },
                            ];

                            const filename = getExportFilename('laporan');
                            return { sheets, filename };
                        }}
                        label="Export Laporan"
                    />
                </div>

                <AIInsightCard
                    title="Insight Laporan"
                    prompt="Buat ringkasan laporan keuangan: total pendapatan, pengeluaran terbesar, lokasi terbaik, dan apakah ada tagihan yang belum dibayar. Berikan 1 rekomendasi. Maksimal 4 kalimat."
                />

                <LaporanClient data={data} highOccupancy={highOccupancy} />
            </main>
        </div>
    );
}
