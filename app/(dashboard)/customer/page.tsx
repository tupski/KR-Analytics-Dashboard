import Link from 'next/link';
import { fetchCustomers } from './actions';
import KraiInsightCard from '@/components/ai/KraiInsightCard';
import MetricCardHorizontal from '@/components/dashboard/MetricCardHorizontal';
import FilterBarWrapper from '@/components/shared/FilterBarWrapper';
import ExportButton from '@/components/shared/ExportButton';
import { Users, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, UserCheck } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

function buildHref(base: { search: string; pageSize: number; rangePreset?: string; startDate?: string; endDate?: string }, page: number) {
    const params = new URLSearchParams();
    if (base.search) params.set('search', base.search);
    if (page > 1) params.set('page', String(page));
    if (base.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(base.pageSize));
    if (base.rangePreset) params.set('rangePreset', base.rangePreset);
    if (base.startDate) params.set('startDate', base.startDate);
    if (base.endDate) params.set('endDate', base.endDate);
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

    // Unified date filter params
    const rangePreset = typeof params.rangePreset === 'string' ? params.rangePreset : undefined;
    const startDate = typeof params.startDate === 'string' ? params.startDate : undefined;
    const endDate = typeof params.endDate === 'string' ? params.endDate : undefined;
    const comparisonMode = typeof params.comparisonMode === 'string' ? params.comparisonMode : undefined;
    const comparisonStartDate = typeof params.comparisonStartDate === 'string' ? params.comparisonStartDate : undefined;
    const comparisonEndDate = typeof params.comparisonEndDate === 'string' ? params.comparisonEndDate : undefined;

    const dateParams = rangePreset ? { rangePreset, startDate, endDate, comparisonMode, comparisonStartDate, comparisonEndDate } : undefined;

    const { items: customers, totalCount: count } = await fetchCustomers(search || undefined, page, pageSize, dateParams);

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

    const baseLink = { search, pageSize, rangePreset, startDate, endDate };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Customer</h1>
                <p className="mt-1 text-xs sm:text-sm text-gray-500">Data tamu yang pernah menginap di Kakarama Room</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* KraiInsightCard — collapsed by default, at very top */}
                <KraiInsightCard
                    pageContext="customer"
                    title="Insight Customer"
                    subtitle="Analisis pola booking pelanggan"
                    defaultCollapsed={true}
                />

                {/* Stats cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <MetricCardHorizontal
                        icon={<Users className="w-5 h-5" />}
                        title="Total Tamu"
                        value={count}
                        subtitle="Sepanjang periode terpilih"
                        isComparisonActive={false}
                        semanticType="neutral"
                    />
                    <MetricCardHorizontal
                        icon={<UserCheck className="w-5 h-5" />}
                        title="Unique Tamu"
                        value={new Set(customers.map((c: any) => c.customerName)).size}
                        subtitle="Nama unik dalam periode ini"
                        isComparisonActive={false}
                        semanticType="neutral"
                    />
                </div>

                {/* Filter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <FilterBarWrapper
                        basePath="/customer"
                        rangePreset={rangePreset || 'last30days'}
                        startDate={startDate}
                        endDate={endDate}
                        comparisonMode={comparisonMode || 'none'}
                        comparisonStartDate={comparisonStartDate}
                        comparisonEndDate={comparisonEndDate}
                        extraPreservedParams={['search', 'page', 'pageSize']}
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
                        {/* Preserve pageSize and date params when searching */}
                        {pageSize !== DEFAULT_PAGE_SIZE && (
                            <input type="hidden" name="pageSize" value={pageSize} />
                        )}
                        {rangePreset && <input type="hidden" name="rangePreset" value={rangePreset} />}
                        {startDate && <input type="hidden" name="startDate" value={startDate} />}
                        {endDate && <input type="hidden" name="endDate" value={endDate} />}
                        <button type="submit" className="px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex-shrink-0">
                            Cari
                        </button>
                    </div>
                </form>

                {/* Stats + page size + export */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>{count.toLocaleString('id-ID')} total record</span>
                        {count > 0 && (
                            <span className="text-gray-400">· menampilkan {startIdx.toLocaleString('id-ID')}–{endIdx.toLocaleString('id-ID')}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <ExportButton page="customer" label="Export Customer" />
                    </div>
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
                                        <td className="px-4 py-3 font-medium text-gray-900">{c.customerName}</td>
                                        <td className="px-4 py-3 text-gray-700">{c.apartmentLocation}</td>
                                        <td className="px-4 py-3"><span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{c.roomNumber}</span></td>
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDateTime(c.checkinAt)}</td>
                                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDateTime(c.checkoutAt)}</td>
                                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency((c.cashAmount || 0) + (c.transferAmount || 0))}</td>
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
