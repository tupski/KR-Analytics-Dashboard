import { createServerClient } from '@/lib/supabase/server';

export interface GuestStayHistoryResult {
    query: string;
    match_status: 'single_match' | 'multiple_matches' | 'no_match';
    guest_name: string;
    total_stays: number;
    total_revenue: number;
    stays: Array<{
        checkin_date: string;
        checkout_date: string;
        location: string;
        room: string;
        revenue: number;
    }>;
    likely_matches: Array<{
        name: string;
        phone?: string;
        total_stays: number;
    }>;
}

export async function getGuestStayHistory(guestQuery: string): Promise<GuestStayHistoryResult> {
    const supabase = createServerClient();

    // Search for guest by name (case-insensitive)
    const { data: guests, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .ilike('name', `%${guestQuery}%`)
        .limit(10);

    if (error) throw new Error(`Failed to search guests: ${error.message}`);

    if (!guests || guests.length === 0) {
        return {
            query: guestQuery,
            match_status: 'no_match',
            guest_name: guestQuery,
            total_stays: 0,
            total_revenue: 0,
            stays: [],
            likely_matches: [],
        };
    }

    // Single match
    if (guests.length === 1) {
        const guest = guests[0];
        const { data: transactions } = await supabase
            .from('transactions')
            .select('checkin_at, checkout_at, locations(name), units(nomor_kamar), total_amount')
            .eq('customer_id', guest.id)
            .order('checkin_at', { ascending: false });

        const stays = (transactions || []).map(tx => ({
            checkin_date: tx.checkin_at?.split('T')[0] || '',
            checkout_date: tx.checkout_at?.split('T')[0] || '',
            location: (tx as any).locations?.name || '',
            room: (tx as any).units?.nomor_kamar || '',
            revenue: tx.total_amount || 0,
        }));

        const totalRevenue = stays.reduce((sum, s) => sum + s.revenue, 0);

        return {
            query: guestQuery,
            match_status: 'single_match',
            guest_name: guest.name,
            total_stays: stays.length,
            total_revenue: totalRevenue,
            stays,
            likely_matches: [],
        };
    }

    // Multiple matches — return summary for each
    const guestResults = await Promise.all(
        guests.map(async (g) => {
            const { count } = await supabase
                .from('transactions')
                .select('*', { count: 'exact', head: true })
                .eq('customer_id', g.id);
            return {
                name: g.name,
                phone: g.phone,
                total_stays: count || 0,
            };
        })
    );

    // If one guest has significantly more stays, pick them as primary
    guestResults.sort((a, b) => b.total_stays - a.total_stays);
    const bestGuest = guestResults[0];
    const primaryGuest = guests.find(g => g.name === bestGuest.name);

    if (primaryGuest) {
        const { data: transactions } = await supabase
            .from('transactions')
            .select('checkin_at, checkout_at, locations(name), units(nomor_kamar), total_amount')
            .eq('customer_id', primaryGuest.id)
            .order('checkin_at', { ascending: false });

        const stays = (transactions || []).map(tx => ({
            checkin_date: tx.checkin_at?.split('T')[0] || '',
            checkout_date: tx.checkout_at?.split('T')[0] || '',
            location: (tx as any).locations?.name || '',
            room: (tx as any).units?.nomor_kamar || '',
            revenue: tx.total_amount || 0,
        }));

        return {
            query: guestQuery,
            match_status: 'multiple_matches',
            guest_name: primaryGuest.name,
            total_stays: stays.length,
            total_revenue: stays.reduce((sum, s) => sum + s.revenue, 0),
            stays,
            likely_matches: guestResults.slice(1).map(r => ({ name: r.name, phone: r.phone, total_stays: r.total_stays })),
        };
    }

    // Fallback
    return {
        query: guestQuery,
        match_status: 'no_match',
        guest_name: guestQuery,
        total_stays: 0,
        total_revenue: 0,
        stays: [],
        likely_matches: guestResults.map(r => ({ name: r.name, phone: r.phone, total_stays: r.total_stays })),
    };
}
