/**
 * Guest stay history — 3-step search for guest stay records.
 *
 * Step A: Today's check-ins (effective date = today Asia/Jakarta)
 * Step B: Currently staying (isCurrentlyStaying)
 * Step C: Historical latest (broad name search, sorted by effective date desc)
 *
 * Returns unified structure with bestMatch identification.
 * SELECT-only, parameterized queries. Falls back from Supabase to queryAnalytics.
 */

import { createServerClient } from '@/lib/supabase/server';
import { queryAnalytics } from '@/lib/analytics/db';
import { format, toZonedTime } from 'date-fns-tz';
import {
    normalizeText,
    fuzzyNameMatch,
    fuzzyLocationMatch,
    isCurrentlyStaying,
    formatTimeWIB,
} from '@/lib/ai/tools/shared/normalize';
import type { TransactionStay } from '@/lib/ai/tools/shared/normalize';

// ─── Types ──────────────────────────────────────────────────

export interface GuestStayMatchItem {
    id: string;
    customerName: string | null;
    location: string | null;
    roomNumber: string | null;
    checkinAt: string | null;
    effectiveCheckinAt: string | null;
    checkinTimeWIB: string | null;
    checkoutAt: string | null;
    revenue: number | null;
}

export interface GuestStayHistoryResult {
    ok: boolean;
    query: { guestName: string; location?: string };
    todayMatches: GuestStayMatchItem[];
    liveMatches: GuestStayMatchItem[];
    historyMatches: GuestStayMatchItem[];
    bestMatch: GuestStayMatchItem | null;
    bestMatchSource: 'today' | 'live' | 'history' | null;
}

// ─── Helpers ────────────────────────────────────────────────

function mapTxToMatchItem(tx: any): GuestStayMatchItem {
    const effCheckin = tx.checkin_at || tx.created_at;
    return {
        id: tx.id || '',
        customerName: tx.customer_name || null,
        location: tx.apartment_location || null,
        roomNumber: tx.room_number || null,
        checkinAt: tx.checkin_at || null,
        effectiveCheckinAt: effCheckin || null,
        checkinTimeWIB: formatTimeWIB(effCheckin),
        checkoutAt: tx.checkout_at || null,
        revenue: (tx.cash_amount || 0) + (tx.transfer_amount || 0),
    };
}

function pickBestMatch(
    today: GuestStayMatchItem[],
    live: GuestStayMatchItem[],
    history: GuestStayMatchItem[],
): { bestMatch: GuestStayMatchItem | null; bestMatchSource: 'today' | 'live' | 'history' | null } {
    if (today.length > 0) return { bestMatch: today[0], bestMatchSource: 'today' };
    if (live.length > 0) return { bestMatch: live[0], bestMatchSource: 'live' };
    if (history.length > 0) return { bestMatch: history[0], bestMatchSource: 'history' };
    return { bestMatch: null, bestMatchSource: null };
}

// ─── Supabase query helper ──────────────────────────────────

async function querySupabaseILike(
    guestName: string,
    location?: string,
    additionalFilter?: (q: any) => any,
    limit: number = 50,
): Promise<any[]> {
    const supabase = createServerClient();
    let q = supabase
        .from('transactions')
        .select('id, customer_name, apartment_location, room_number, checkin_at, created_at, checkout_at, rental_duration, cash_amount, transfer_amount')
        .ilike('customer_name', `%${guestName.trim()}%`);

    if (location) {
        q = q.ilike('apartment_location', `%${location.trim()}%`);
    }

    if (additionalFilter) {
        q = additionalFilter(q);
    }

    q = q.limit(limit);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

// ─── Analytics DB fallback ──────────────────────────────────

async function queryAnalyticsILike(
    guestName: string,
    whereClause: string,
    params: any[],
    limit: number = 50,
): Promise<any[]> {
    const sql = `SELECT id, customer_name, apartment_location, room_number, checkin_at, created_at, checkout_at, rental_duration, cash_amount, transfer_amount
FROM transactions
WHERE customer_name ILIKE $1 AND ${whereClause}
ORDER BY COALESCE(checkin_at, created_at) DESC
LIMIT $${params.length + 1}`;

    const allParams = [`%${guestName.trim()}%`, ...params, limit];
    try {
        return await queryAnalytics<any>(sql, allParams);
    } catch {
        return [];
    }
}

// ─── Main 3-step search ─────────────────────────────────────

export async function getGuestStayHistory(
    guestName: string,
    location?: string,
    limit: number = 50,
): Promise<GuestStayHistoryResult> {
    const emptyResult: GuestStayHistoryResult = {
        ok: true,
        query: { guestName, location },
        todayMatches: [],
        liveMatches: [],
        historyMatches: [],
        bestMatch: null,
        bestMatchSource: null,
    };

    if (!guestName || !guestName.trim()) {
        return { ...emptyResult, ok: false };
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const tz = 'Asia/Jakarta';
    const now = toZonedTime(new Date(), tz);
    const todayStr = format(now, 'yyyy-MM-dd');

    // ── Step A: Today's check-ins ─────────────────────────────
    let todayMatches: GuestStayMatchItem[] = [];
    try {
        const todayStart = format(now, "yyyy-MM-dd'T'00:00:00.000'xxx'", { timeZone: tz });
        const tomorrowStart = format(
            new Date(now.getTime() + 86400000),
            "yyyy-MM-dd'T'00:00:00.000'xxx'",
            { timeZone: tz },
        );

        const todayRows = await querySupabaseILike(guestName, location, (q) => {
            return q.or(`checkin_at.gte.${todayStart},and(checkin_at.is.null,created_at.gte.${todayStart})`);
        }, safeLimit);

        // JS filter: effective date in [todayStart, tomorrowStart)
        todayMatches = (todayRows || [])
            .filter((t: any) => {
                const effDate = t.checkin_at || t.created_at || '';
                return effDate && effDate >= todayStart && effDate < tomorrowStart;
            })
            .map(mapTxToMatchItem);
    } catch (err) {
        console.warn('[guest-history] Step A Supabase failed, trying fallback:', err);
        try {
            const todayStart = format(now, "yyyy-MM-dd'T'00:00:00.000'xxx'", { timeZone: tz });
            const tomorrowStart = format(
                new Date(now.getTime() + 86400000),
                "yyyy-MM-dd'T'00:00:00.000'xxx'",
                { timeZone: tz },
            );
            const rows = await queryAnalyticsILike(
                guestName,
                `(checkin_at >= $2 AND checkin_at < $3) OR (checkin_at IS NULL AND created_at >= $2 AND created_at < $3)`,
                [todayStart, tomorrowStart],
                safeLimit,
            );
            // Already filtered by the SQL where clause
            todayMatches = rows.map(mapTxToMatchItem);
        } catch (fallbackErr) {
            console.warn('[guest-history] Step A fallback also failed:', fallbackErr);
        }
    }

    if (todayMatches.length > 0) {
        const { bestMatch, bestMatchSource } = pickBestMatch(todayMatches, [], []);
        return {
            ok: true,
            query: { guestName, location },
            todayMatches,
            liveMatches: [],
            historyMatches: [],
            bestMatch,
            bestMatchSource,
        };
    }

    // ── Step B: Currently staying ─────────────────────────────
    let liveMatches: GuestStayMatchItem[] = [];
    try {
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

        const liveRows = await querySupabaseILike(guestName, location, (q) => {
            return q.or(`checkin_at.gte.${threeDaysAgo},and(checkin_at.is.null,created_at.gte.${threeDaysAgo})`);
        }, safeLimit);

        const nowDate = new Date();
        liveMatches = (liveRows || [])
            .filter((t: any) => isCurrentlyStaying(t as TransactionStay, nowDate))
            .map(mapTxToMatchItem);
    } catch (err) {
        console.warn('[guest-history] Step B Supabase failed:', err);
    }

    if (liveMatches.length > 0) {
        const { bestMatch, bestMatchSource } = pickBestMatch([], liveMatches, []);
        return {
            ok: true,
            query: { guestName, location },
            todayMatches: [],
            liveMatches,
            historyMatches: [],
            bestMatch,
            bestMatchSource,
        };
    }

    // ── Step C: Historical latest ─────────────────────────────
    let historyMatches: GuestStayMatchItem[] = [];
    try {
        const histRows = await querySupabaseILike(guestName, undefined, undefined, safeLimit);

        // Apply location filter in JS if needed
        const filtered = location
            ? (histRows || []).filter((t: any) => fuzzyLocationMatch(location, t.apartment_location))
            : histRows;

        // Sort by effective date descending
        filtered.sort((a: any, b: any) => {
            const aEff = (a.checkin_at || a.created_at || '');
            const bEff = (b.checkin_at || b.created_at || '');
            return bEff.localeCompare(aEff);
        });

        historyMatches = filtered.slice(0, safeLimit).map(mapTxToMatchItem);
    } catch (err) {
        console.warn('[guest-history] Step C Supabase failed, trying fallback:', err);
        try {
            const rows = await queryAnalyticsILike(guestName, '1=1', [], safeLimit);
            const filtered = location
                ? rows.filter((t: any) => fuzzyLocationMatch(location, t.apartment_location))
                : rows;
            historyMatches = filtered.slice(0, safeLimit).map(mapTxToMatchItem);
        } catch (fallbackErr) {
            console.warn('[guest-history] Step C fallback also failed:', fallbackErr);
        }
    }

    const { bestMatch, bestMatchSource } = pickBestMatch([], [], historyMatches);

    return {
        ok: true,
        query: { guestName, location },
        todayMatches: [],
        liveMatches: [],
        historyMatches,
        bestMatch,
        bestMatchSource,
    };
}
