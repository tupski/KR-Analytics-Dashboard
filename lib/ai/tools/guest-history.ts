/**
 * Guest stay history — search guest stay records by name.
 *
 * Uses analytics PostgreSQL directly for fast ILIKE search + stay history.
 * SELECT-only, parameterized queries.
 *
 * Migrated from Supabase customers table to analytics DB transactions mirror
 * for consistency with other AI tools and centralized data access pattern.
 */

import { queryAnalytics } from '@/lib/analytics/db';

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

export async function getGuestStayHistory(
    guestQuery: string,
    startDate?: string,
    endDate?: string,
    location?: string,
    roomNumber?: string,
    fuzzyMatch?: boolean,
    limit?: number,
): Promise<GuestStayHistoryResult> {
    if (!guestQuery || !guestQuery.trim()) {
        return {
            query: guestQuery,
            match_status: 'no_match',
            guest_name: guestQuery || '',
            total_stays: 0,
            total_revenue: 0,
            stays: [],
            likely_matches: [],
        };
    }

    const safeLimit = limit ? Math.min(Math.max(1, limit), 100) : 20;
    const normalizedName = guestQuery.trim().replace(/\s+/g, ' ');

    // Step 1: Find matching customer names (case-insensitive ILIKE) from transactions
    let nameQuery = `SELECT DISTINCT customer_name, COUNT(*)::INT as stay_count
FROM transactions
WHERE customer_name ILIKE $1 AND is_deleted = false`;
    const nameParams: any[] = [`%${normalizedName}%`];
    let paramIdx = 2;

    if (startDate) {
        nameQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $${paramIdx}::date`;
        nameParams.push(startDate);
        paramIdx++;
    }
    if (endDate) {
        nameQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $${paramIdx}::date`;
        nameParams.push(endDate);
        paramIdx++;
    }
    if (location) {
        nameQuery += ` AND apartment_location = $${paramIdx}`;
        nameParams.push(location);
        paramIdx++;
    }
    if (roomNumber) {
        nameQuery += ` AND room_number ILIKE $${paramIdx}`;
        nameParams.push(`%${roomNumber}%`);
        paramIdx++;
    }

    nameQuery += ` GROUP BY customer_name ORDER BY stay_count DESC LIMIT 20`;

    let nameRows: any[];
    try {
        nameRows = await queryAnalytics<any>(nameQuery, nameParams);
    } catch {
        return {
            query: guestQuery,
            match_status: 'no_match',
            guest_name: normalizedName,
            total_stays: 0,
            total_revenue: 0,
            stays: [],
            likely_matches: [],
        };
    }

    if (!nameRows || nameRows.length === 0) {
        return {
            query: guestQuery,
            match_status: 'no_match',
            guest_name: normalizedName,
            total_stays: 0,
            total_revenue: 0,
            stays: [],
            likely_matches: [],
        };
    }

    // Single match
    if (nameRows.length === 1) {
        const matchedName = nameRows[0].customer_name;
        const stays = await fetchStaysForGuest(matchedName, startDate, endDate, location, roomNumber, safeLimit);

        const totalRevenue = (stays || []).reduce(
            (sum: number, s: any) => sum + (parseFloat(s.amount) || 0),
            0,
        );

        return {
            query: guestQuery,
            match_status: 'single_match',
            guest_name: matchedName,
            total_stays: stays?.length || 0,
            total_revenue: Math.round(totalRevenue * 100) / 100,
            stays: (stays || []).map(mapStayRow),
            likely_matches: [],
        };
    }

    // Multiple matches — build likely matches list
    const matchResults = nameRows.map((r: any) => ({
        name: r.customer_name,
        phone: undefined,
        total_stays: parseInt(r.stay_count) || 0,
    }));

    // Sort by stay count descending, pick best match as primary
    matchResults.sort((a, b) => b.total_stays - a.total_stays);
    const bestGuest = matchResults[0];
    const stays = await fetchStaysForGuest(bestGuest.name, startDate, endDate, location, roomNumber, safeLimit);

    const totalRevenue = (stays || []).reduce(
        (sum: number, s: any) => sum + (parseFloat(s.amount) || 0),
        0,
    );

    return {
        query: guestQuery,
        match_status: 'multiple_matches',
        guest_name: bestGuest.name,
        total_stays: stays?.length || 0,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        stays: (stays || []).map(mapStayRow),
        likely_matches: matchResults.slice(1),
    };
}

async function fetchStaysForGuest(
    customerName: string,
    startDate?: string,
    endDate?: string,
    location?: string,
    roomNumber?: string,
    safeLimit: number = 20,
): Promise<any[]> {
    let staysQuery = `SELECT
    (created_at AT TIME ZONE 'Asia/Jakarta')::DATE as check_in_date,
    (checkout_at AT TIME ZONE 'Asia/Jakarta')::DATE as check_out_date,
    apartment_location as location_name,
    room_number,
    rental_duration,
    CASE
        WHEN rental_duration = 0 THEN 'Transit'
        WHEN rental_duration = 1 THEN 'Fullday'
        WHEN rental_duration = 2 THEN 'Promo 2 Malam'
        ELSE rental_duration::TEXT || ' Malam'
    END as duration_label,
    marketing_name as booking_source,
    COALESCE(cash_amount, 0) + COALESCE(transfer_amount, 0) as amount,
    status,
    is_deleted
FROM transactions
WHERE customer_name = $1 AND is_deleted = false`;
    const stayParams: any[] = [customerName];
    let stayIdx = 2;

    if (startDate) {
        staysQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE >= $${stayIdx}::date`;
        stayParams.push(startDate);
        stayIdx++;
    }
    if (endDate) {
        staysQuery += ` AND (created_at AT TIME ZONE 'Asia/Jakarta')::DATE <= $${stayIdx}::date`;
        stayParams.push(endDate);
        stayIdx++;
    }
    if (location) {
        staysQuery += ` AND apartment_location = $${stayIdx}`;
        stayParams.push(location);
        stayIdx++;
    }
    if (roomNumber) {
        staysQuery += ` AND room_number ILIKE $${stayIdx}`;
        stayParams.push(`%${roomNumber}%`);
        stayIdx++;
    }

    staysQuery += ` ORDER BY (created_at AT TIME ZONE 'Asia/Jakarta')::DATE DESC LIMIT ${safeLimit}`;

    try {
        return await queryAnalytics<any>(staysQuery, stayParams);
    } catch {
        return [];
    }
}

function mapStayRow(s: any): GuestStayHistoryResult['stays'][0] {
    return {
        checkin_date: s.check_in_date || '',
        checkout_date: s.check_out_date || '',
        location: s.location_name || '',
        room: s.room_number || '',
        revenue: Math.round((parseFloat(s.amount) || 0) * 100) / 100,
    };
}
