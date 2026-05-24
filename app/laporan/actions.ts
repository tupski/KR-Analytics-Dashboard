'use server';

import { createServerClient } from '@/lib/supabase/server';
import { format, subDays, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export type DateFilter = 'today' | 'yesterday' | '7days' | 'month' | 'year';

function getDateRange(filter: DateFilter) {
    const timezone = 'Asia/Jakarta';
    const now = toZonedTime(new Date(), timezone);
    // Hotel day starts at 12:00 WIB
    const hotelDayStart = new Date(now);
    hotelDayStart.setHours(12, 0, 0, 0);
    if (now < hotelDayStart) hotelDayStart.setDate(hotelDayStart.getDate() - 1);

    const todayStr = format(hotelDayStart, 'yyyy-MM-dd');

    switch (filter) {
        case 'today': {
            const start = `${todayStr}T12:00:00`;
            const end = `${format(new Date(hotelDayStart.getTime() + 86400000), 'yyyy-MM-dd')}T11:59:59`;
            return { start, end, label: 'Hari Ini' };
        }
        case 'yesterday': {
            const yesterday = new Date(hotelDayStart.getTime() - 86400000);
            const start = `${format(yesterday, 'yyyy-MM-dd')}T12:00:00`;
            const end = `${todayStr}T11:59:59`;
            return { start, end, label: 'Kemarin' };
        }
        case '7days': {
            const weekAgo = new Date(hotelDayStart.getTime() - 7 * 86400000);
            const start = `${format(weekAgo, 'yyyy-MM-dd')}T12:00:00`;
            const end = `${format(new Date(hotelDayStart.getTime() + 86400000), 'yyyy-MM-dd')}T11:59:59`;
            return { start, end, label: '7 Hari Terakhir' };
        }
        case 'month': {
            const monthStart = format(now, 'yyyy-MM-01');
            const start = `${monthStart}T00:00:00`;
            const end = `${format(new Date(hotelDayStart.getTime() + 86400000), 'yyyy-MM-dd')}T11:59:59`;
            return { start, end, label: 'Bulan Ini' };
        }
        case 'year': {
            const yearStart = format(now, 'yyyy-01-01');
            const start = `${yearStart}T00:00:00`;
            const end = `${format(new Date(hotelDayStart.getTime() + 86400000), 'yyyy-MM-dd')}T11:59:59`;
            return { start, end, label: 'Tahun Ini' };
        }
    }
}

export interface LocationReport {
    name: string;
    totalRooms: number;
    transactions: number;
    revenue: number;
    rooms: RoomReport[];
}

export interface RoomReport {
    roomNumber: string;
    location: string;
    transactions: number;
    revenue: number;
    occupancyRate: number;
}

export interface RoomDetail {
    id: number;
    customerName: string;
    checkinAt: string;
    checkoutAt: string;
    rentalDuration: number;
    cashAmount: number;
    transferAmount: number;
    transferTo: string | null;
    marketingName: string | null;
    marketingFee: number;
    inputBy: string | null;
    shift: string | null;
}

export interface ExpenseReport {
    category: string;
    total: number;
    count: number;
}

export interface TagihanReport {
    paid: number;
    unpaid: number;
    paidCount: number;
    unpaidCount: number;
}

export interface FeeMarketingReport {
    totalPaid: number;
    totalUnpaid: number;
    paidCount: number;
    unpaidCount: number;
}

export interface LaporanData {
    filter: DateFilter;
    filterLabel: string;
    // Revenue
    totalRevenue: number;
    totalTransactions: number;
    totalCash: number;
    totalTransfer: number;
    // Locations
    locations: LocationReport[];
    // Expenses
    expenses: ExpenseReport[];
    totalExpenses: number;
    expensesPerLocation: Record<string, { category: string; total: number; count: number }[]>;
    // Tagihan
    tagihan: TagihanReport;
    // Fee Marketing
    feeMarketing: FeeMarketingReport;
    // Comparison
    comparison?: { prevRevenue: number; prevTransactions: number; prevLabel: string };
}

export async function fetchLaporanData(filter: DateFilter = 'today'): Promise<LaporanData> {
    const supabase = createServerClient();
    const { start, end, label } = getDateRange(filter);

    // Fetch transactions in range
    const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .gte('checkin_at', start)
        .lte('checkin_at', end)
        .order('checkin_at', { ascending: false });

    const txList = transactions || [];
    const totalRevenue = txList.reduce((s, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0);
    const totalCash = txList.reduce((s, t: any) => s + (t.cash_amount || 0), 0);
    const totalTransfer = txList.reduce((s, t: any) => s + (t.transfer_amount || 0), 0);

    // Get rooms per location
    const { data: allRooms } = await supabase.from('nomor_kamar').select('name, lokasi');
    const roomsByLocation: Record<string, string[]> = {};
    allRooms?.forEach((r: any) => {
        if (!roomsByLocation[r.lokasi]) roomsByLocation[r.lokasi] = [];
        roomsByLocation[r.lokasi].push(r.name);
    });

    // Group by location and room
    const locMap: Record<string, { transactions: number; revenue: number; rooms: Record<string, { tx: number; rev: number }> }> = {};
    txList.forEach((t: any) => {
        const loc = t.apartment_location;
        if (!locMap[loc]) locMap[loc] = { transactions: 0, revenue: 0, rooms: {} };
        locMap[loc].transactions++;
        locMap[loc].revenue += (t.cash_amount || 0) + (t.transfer_amount || 0);
        const room = t.room_number;
        if (!locMap[loc].rooms[room]) locMap[loc].rooms[room] = { tx: 0, rev: 0 };
        locMap[loc].rooms[room].tx++;
        locMap[loc].rooms[room].rev += (t.cash_amount || 0) + (t.transfer_amount || 0);
    });

    // Calculate days in period for occupancy
    const startDate = new Date(start);
    const endDate = new Date(end);
    const periodDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));

    const locations: LocationReport[] = Object.entries(locMap)
        .map(([name, data]) => ({
            name,
            totalRooms: roomsByLocation[name]?.length || 0,
            transactions: data.transactions,
            revenue: data.revenue,
            rooms: Object.entries(data.rooms)
                .map(([roomNumber, rd]) => ({
                    roomNumber,
                    location: name,
                    transactions: rd.tx,
                    revenue: rd.rev,
                    occupancyRate: Math.min(100, Math.round((rd.tx / periodDays) * 100)),
                }))
                .sort((a, b) => b.transactions - a.transactions),
        }))
        .sort((a, b) => b.revenue - a.revenue);

    // Expenses in range
    const { data: expenseData } = await supabase
        .from('pengeluaran')
        .select('category, jumlah, apartment_location, room_number')
        .gte('tanggal', start.split('T')[0])
        .lte('tanggal', end.split('T')[0]);

    const expMap: Record<string, { total: number; count: number }> = {};
    const expPerLocation: Record<string, { category: string; total: number; count: number }[]> = {};

    expenseData?.forEach((e: any) => {
        const cat = e.category || 'Lainnya';
        if (!expMap[cat]) expMap[cat] = { total: 0, count: 0 };
        expMap[cat].total += e.jumlah || 0;
        expMap[cat].count++;

        // Group by location if available
        const loc = e.apartment_location;
        if (loc) {
            if (!expPerLocation[loc]) expPerLocation[loc] = [];
            const existing = expPerLocation[loc].find(x => x.category === cat);
            if (existing) { existing.total += e.jumlah || 0; existing.count++; }
            else expPerLocation[loc].push({ category: cat, total: e.jumlah || 0, count: 1 });
        }
    });

    const expenses = Object.entries(expMap)
        .map(([category, d]) => ({ category, total: d.total, count: d.count }))
        .sort((a, b) => b.total - a.total);

    const totalExpenses = expenses.reduce((s, e) => s + e.total, 0);

    // Tagihan bulanan
    const { data: tagihanPaid } = await supabase
        .from('tagihan_bulanan')
        .select('amount')
        .eq('status', 'paid');
    const { data: tagihanUnpaid } = await supabase
        .from('tagihan_bulanan')
        .select('amount')
        .eq('status', 'unpaid');

    const tagihan: TagihanReport = {
        paid: tagihanPaid?.reduce((s, t: any) => s + (t.amount || 0), 0) || 0,
        unpaid: tagihanUnpaid?.reduce((s, t: any) => s + (t.amount || 0), 0) || 0,
        paidCount: tagihanPaid?.length || 0,
        unpaidCount: tagihanUnpaid?.length || 0,
    };

    // Fee Marketing - paid vs unpaid (unpaid = transactions with marketing_fee > 0 that don't have a matching fee_lunas_item)
    const { data: feePaid } = await supabase
        .from('tagihan_fee_lunas_items')
        .select('fee_amount');
    const totalFeePaid = feePaid?.reduce((s, f: any) => s + (f.fee_amount || 0), 0) || 0;

    const totalFeeAll = txList.reduce((s, t: any) => s + (t.marketing_fee || 0), 0);

    const feeMarketing: FeeMarketingReport = {
        totalPaid: totalFeePaid,
        totalUnpaid: Math.max(0, totalFeeAll - totalFeePaid),
        paidCount: feePaid?.length || 0,
        unpaidCount: 0,
    };

    // Comparison with previous period
    let comparison: LaporanData['comparison'];
    if (filter === 'today' || filter === 'yesterday') {
        const prevFilter = filter === 'today' ? 'yesterday' : 'today';
        const prev = getDateRange(filter === 'today' ? 'yesterday' : 'today');
        const { data: prevTx } = await supabase
            .from('transactions')
            .select('cash_amount, transfer_amount')
            .gte('checkin_at', prev.start)
            .lte('checkin_at', prev.end);
        comparison = {
            prevRevenue: prevTx?.reduce((s, t: any) => s + (t.cash_amount || 0) + (t.transfer_amount || 0), 0) || 0,
            prevTransactions: prevTx?.length || 0,
            prevLabel: prev.label,
        };
    }

    return {
        filter,
        filterLabel: label,
        totalRevenue,
        totalTransactions: txList.length,
        totalCash,
        totalTransfer,
        locations,
        expenses,
        totalExpenses,
        expensesPerLocation: expPerLocation,
        tagihan,
        feeMarketing,
        comparison,
    };
}

export async function fetchRoomDetails(location: string, roomNumber: string, filter: DateFilter = 'today'): Promise<RoomDetail[]> {
    const supabase = createServerClient();
    const { start, end } = getDateRange(filter);

    const { data } = await supabase
        .from('transactions')
        .select('id, customer_name, checkin_at, checkout_at, rental_duration, cash_amount, transfer_amount, transfer_to, marketing_name, marketing_fee, input_by, shift')
        .eq('apartment_location', location)
        .eq('room_number', roomNumber)
        .gte('checkin_at', start)
        .lte('checkin_at', end)
        .order('checkin_at', { ascending: false });

    return (data || []).map((t: any) => ({
        id: t.id,
        customerName: t.customer_name,
        checkinAt: t.checkin_at,
        checkoutAt: t.checkout_at,
        rentalDuration: t.rental_duration,
        cashAmount: t.cash_amount || 0,
        transferAmount: t.transfer_amount || 0,
        transferTo: t.transfer_to,
        marketingName: t.marketing_name,
        marketingFee: t.marketing_fee || 0,
        inputBy: t.input_by,
        shift: t.shift,
    }));
}

/** Detect LOCATIONS where overall occupancy is ≥90% (all units combined) */
export async function fetchHighOccupancyLocations(days: number = 30) {
    const supabase = createServerClient();
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    const { data: allRooms } = await supabase.from('nomor_kamar').select('name, lokasi');
    const { data: transactions } = await supabase
        .from('transactions')
        .select('room_number, apartment_location, checkin_at')
        .gte('checkin_at', `${startDate}T00:00:00`)
        .lte('checkin_at', `${endDate}T23:59:59`);

    // Count rooms per location
    const roomsPerLocation: Record<string, number> = {};
    allRooms?.forEach((r: any) => {
        roomsPerLocation[r.lokasi] = (roomsPerLocation[r.lokasi] || 0) + 1;
    });

    // Count unique room-days used per location
    // (how many room-days were occupied out of total possible room-days)
    const locationUsage: Record<string, Set<string>> = {};
    transactions?.forEach((t: any) => {
        const loc = t.apartment_location;
        if (!locationUsage[loc]) locationUsage[loc] = new Set();
        // Each unique room+date combination counts as 1 room-day
        const dayKey = `${t.room_number}|${format(new Date(t.checkin_at), 'yyyy-MM-dd')}`;
        locationUsage[loc].add(dayKey);
    });

    // Calculate occupancy rate per location
    const results = Object.entries(roomsPerLocation)
        .map(([location, totalRooms]) => {
            const totalPossibleRoomDays = totalRooms * days;
            const usedRoomDays = locationUsage[location]?.size || 0;
            const occupancyRate = Math.round((usedRoomDays / totalPossibleRoomDays) * 100);
            return { location, totalRooms, usedRoomDays, totalPossibleRoomDays, occupancyRate };
        })
        .filter(r => r.occupancyRate >= 90)
        .sort((a, b) => b.occupancyRate - a.occupancyRate);

    return results;
}
