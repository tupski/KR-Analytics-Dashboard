import { createServerClient } from '@/lib/supabase/server';
import AIInsightCard from '@/components/ai/AIInsightCard';
import { Users, Search } from 'lucide-react';

async function fetchCustomers(search?: string, page = 1) {
    const supabase = createServerClient();
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    let query = supabase
        .from('transactions')
        .select('customer_name, apartment_location, room_number, checkin_at, checkout_at, cash_amount, transfer_amount', { count: 'exact' });

    if (search) {
        query = query.ilike('customer_name', `%${search}%`);
    }

    const { data, count, error } = await query
        .order('checkin_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

    return { data: data || [], count: count || 0, page, pageSize };
}

export default async function CustomerPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const search = typeof params.search === 'string' ? params.search : '';
    const page = typeof params.page === 'string' ? parseInt(params.page) : 1;

    const { data: customers, count } = await fetchCustomers(search || undefined, page);

    const formatCurrency = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;
    const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Customer</h1>
                <p className="mt-1 text-sm text-gray-500">Data tamu yang pernah menginap di Kakarama Room</p>
            </div>

            <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                <AIInsightCard
                    title="Insight Customer"
                    prompt="Analisis data customer: sebutkan jumlah tamu unik bulan ini, apakah ada tamu repeat, dan lokasi favorit tamu. Maksimal 3 kalimat."
                />

                {/* Search */}
                <form action="/customer" className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                name="search"
                                defaultValue={search}
                                placeholder="Cari nama tamu..."
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                            Cari
                        </button>
                    </div>
                </form>

                {/* Stats */}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4" />
                    <span>{count.toLocaleString('id-ID')} total record</span>
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
                            {customers.map((c: any, i: number) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{c.customer_name}</td>
                                    <td className="px-4 py-3 text-gray-700">{c.apartment_location}</td>
                                    <td className="px-4 py-3"><span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{c.room_number}</span></td>
                                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(c.checkin_at)}</td>
                                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(c.checkout_at)}</td>
                                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency((c.cash_amount || 0) + (c.transfer_amount || 0))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
