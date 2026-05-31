import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import AIInsightCard from '@/components/ai/AIInsightCard';
import ExportButton from '@/components/shared/ExportButton';
import { Users, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { exportToXLSX, getExportFilename, currencyCol, dateCol, type ExportSheet } from '@/lib/export/xlsx';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

async function fetchCustomers(search: string | undefined, page: number, pageSize: number) {
    const supabase = createServerClient();
    const offset = (page - 1) * pageSize;

    let query = supabase
        .from('transactions')
        .select('id, customer_name, apartment_location, room_number, checkin_at, checkout_at, cash_amount, transfer_amount', { count: 'exact' });

    if (search) {
        query = query.ilike('customer_name', `%${search}%`);
    }

    const { data, count } = await query
        .order('checkin_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    return { data: data || [], count: count || 0 };
}

function buildHref(base: { search: string; pageSize: number }, page: number) {
    const params = new URLSearchParams();
    if (base.search) params.set('search', base.search);
    if (page > 1) params.set('page', String(page));
    if (base.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(base.pageSize));
    const qs = params.toString();
    return qs ? `/customer?${qs}` : '/customer';
}

export default async function CustomerPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const search = typeof params.search === 'string' ? params.search : '';
    const page = Math.max(1, typeof params.page === 'string' ? parseInt(params.page) || 1 : 1);
    const rawPageSize = typeof params.pageSize === 'string' ? parseInt(params.pageSize) : DEFAULT_PAGE_SIZE;
    const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE;

    const { data: customers, count } = await fetchCustomers(search || undefined, page, pageSize);

    const formatCurrency = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;
    const formatDateTime = (d: string | null) => {
        if (!d) return '-';
        try {
            const date = new Date(d);
            const datePart = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
            const timePart = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });
            return `${datePart} ${timePart}`;
        } catch {
            return '-';
        }
    };

    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const startIdx = count === 0 ? 0 : (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, count);

    const baseLink = { search, pageSize };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Customer</h1>
                <p className="mt-1 text-xs sm:text-sm text-gray-500">Data tamu yang pernah menginap di Kakarama Room</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                <AIInsightCard
                    title="Insight Customer"
                    prompt="Analisis data customer: sebutkan jumlah tamu unik bulan ini, apakah ada tamu repeat, dan lokasi favorit tamu. Maksimal 3 kalimat."
                />

                {/* Export Button */}
                <div className="flex justify-end mb-2">
                    <ExportButton
                        onExport={async () => {
                            'use server';
                            const supabase = createServerClient();

                            let query = supabase
                                .from('transactions')
                                .select('id, customer_name, apartment_location, room_number, checkin_at, checkout_at, cash_amount, transfer_amount')
                                .order('checkin_at', { ascending: false })
                                .limit(5000);

                            if (search) {
                                query = query.ilike('customer_name', `%${search}%`);
                            }

                            const { data, error } = await query;

                            if (error) {
                                console.error('Error fetching customers for export:', error);
                                return { sheets: [], filename: '' };
                            }

                            const customers = (data || []).map((c: any) => ({
                                customerName: c.customer_name || '',
                                apartmentLocation: c.apartment_location || '',
                                roomNumber: c.room_number || '',
                                checkinAt: c.checkin_at || '',
                                checkoutAt: c.checkout_at || '',
                                cashAmount: c.cash_amount || 0,
                                transferAmount: c.transfer_amount || 0,
                                totalAmount: (c.cash_amount || 0) + (c.transfer_amount || 0),
                            }));

                            const sheets: ExportSheet[] = [
                                {
                                    name: 'Customer',
                                    columns: [
                                        { header: 'Nama Tamu', key: 'customerName' },
                                        { header: 'Lokasi', key: 'apartmentLocation' },
                                        { header: 'Kamar', key: 'roomNumber' },
                                        dateCol('Check-in', 'checkinAt'),
                                        dateCol('Check-out', 'checkoutAt'),
                                        currencyCol('Tunai', 'cashAmount'),
                                        currencyCol('Transfer', 'transferAmount'),
                                        currencyCol('Total', 'totalAmount'),
                                    ],
                                    data: customers,
                                },
                            ];

                            const filename = getExportFilename('customer');
                            return { sheets, filename };
                        }}
                        label="Export Customer"
                    />
                </div>

                {/* Search */}
                <form action="/customer" className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 shadow-sm">
                    <div className="flex gap-2 sm:gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                name="search"
                                defaultValue={search}
                                placeholder="Cari nama tamu..."
                                className="w-full pl-10 pr-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        {/* Preserve pageSize when searching */}
                        {pageSize !== DEFAULT_PAGE_SIZE && (
                            <input type="hidden" name="pageSize" value={pageSize} />
                        )}
                        <button type="submit" className="px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex-shrink-0">
                            Cari
                        </button>
                    </div>
                </form>

                {/* Stats + page size */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>{count.toLocaleString('id-ID')} total record</span>
                        {count > 0 && (
                            <span className="text-gray-400">· menampilkan {startIdx.toLocaleString('id-ID')}–{endIdx.toLocaleString('id-ID')}</span>
                        )}
                    </div>
                    <form action="/customer" className="flex items-center gap-2 text-xs text-gray-600">
                        {search && <input type="hidden" name="search" value={search} />}
                        <label htmlFor="pageSize">Per halaman:</label>
                        <select
                            id="pageSize"
                            name="pageSize"
                            defaultValue={pageSize}
                            className="border border-gray-300 rounded px-2 py-1 text-xs"
                        // form submits on change
                        >
                            {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button type="submit" className="text-xs text-blue-600 hover:underline">Terapkan</button>
                    </form>
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Nama Tamu</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Lokasi</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Kamar</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Check-in</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-600">Check-out</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {customers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                                        Tidak ada data tamu yang cocok.
                                    </td>
                                </tr>
                            ) : (
                                customers.map((c: any) => (
                                    <tr key={c.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{c.customer_name}</td>
                                        <td className="px-4 py-3 text-gray-700">{c.apartment_location}</td>
                                        <td className="px-4 py-3"><span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{c.room_number}</span></td>
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDateTime(c.checkin_at)}</td>
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDateTime(c.checkout_at)}</td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency((c.cash_amount || 0) + (c.transfer_amount || 0))}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {count > pageSize && (
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 p-3">
                        <p className="text-xs text-gray-600">
                            Halaman <strong>{page}</strong> dari <strong>{totalPages}</strong>
                        </p>
                        <div className="flex items-center gap-1">
                            <PageLink href={buildHref(baseLink, 1)} disabled={page <= 1} aria-label="Halaman pertama">
                                <ChevronsLeft className="w-4 h-4" />
                            </PageLink>
                            <PageLink href={buildHref(baseLink, page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
                                <ChevronLeft className="w-4 h-4" />
                            </PageLink>
                            <span className="px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded bg-gray-50">{page}</span>
                            <PageLink href={buildHref(baseLink, page + 1)} disabled={page >= totalPages} aria-label="Halaman berikutnya">
                                <ChevronRight className="w-4 h-4" />
                            </PageLink>
                            <PageLink href={buildHref(baseLink, totalPages)} disabled={page >= totalPages} aria-label="Halaman terakhir">
                                <ChevronsRight className="w-4 h-4" />
                            </PageLink>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function PageLink({
    href,
    disabled,
    children,
    'aria-label': ariaLabel,
}: {
    href: string;
    disabled: boolean;
    children: React.ReactNode;
    'aria-label': string;
}) {
    if (disabled) {
        return (
            <span aria-label={ariaLabel} className="p-1.5 rounded border border-gray-200 text-gray-300 cursor-not-allowed">
                {children}
            </span>
        );
    }
    return (
        <Link
            href={href}
            aria-label={ariaLabel}
            className="p-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
            {children}
        </Link>
    );
}
