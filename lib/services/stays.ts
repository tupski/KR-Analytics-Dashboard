// lib/services/stays.ts
// Canonical helpers for active stay / overlap logic.
// All occupancy, check-in, check-out, and unit status queries MUST use this file.

import { createServerClient, type ServerSupabaseClient } from '@/lib/supabase/server'
import { getNowWIB } from '@/lib/utils/format'
import { getReportPeriodRange } from '@/lib/shared/report-period'

// ============================================================
// Types
// ============================================================

export interface StayTransaction {
    id: string | number
    created_at: string
    checkin_at: string | null
    checkout_at: string | null
    rental_duration: number | null // in hours
    apartment_location: string
    room_number: string
    customer_name: string | null
    // Allow extra fields
    [key: string]: unknown
}

export interface ActiveStay {
    transactionId: string | number
    location: string
    roomNumber: string
    customerName: string | null
    checkinAt: string
    effectiveCheckinAt: string
    estimatedCheckoutAt: string
    rentalDuration: number | null
}

export interface StayPeriod {
    startISO: string  // inclusive
    endExclusiveISO: string  // exclusive
}

// ============================================================
// Canonical stay calculations
// ============================================================

/**
 * Get the effective start date (checkin_at ?? created_at).
 */
export function getEffectiveStart(tx: StayTransaction): Date {
    return new Date(tx.checkin_at || tx.created_at)
}

/**
 * Get the estimated end date/time.
 * If checkout_at exists, use it.
 * Otherwise: effectiveStart + rental_duration hours.
 * If neither rental_duration nor checkout_at, default to 24 hours from start.
 */
export function getEstimatedEnd(tx: StayTransaction): Date {
    const start = getEffectiveStart(tx)

    // 1. checkout_at is highest priority
    if (tx.checkout_at) {
        return new Date(tx.checkout_at)
    }

    // 2. rental_duration if valid positive number
    if (tx.rental_duration != null && typeof tx.rental_duration === 'number' && tx.rental_duration > 0) {
        return new Date(start.getTime() + tx.rental_duration * 60 * 60 * 1000)
    }

    // 3. Fallback to 24 hours with dev warning
    if (process.env.NODE_ENV === 'development') {
        console.warn(
            `[stays] Fallback 24h for transaction ${tx.id}: ` +
            `no checkout_at and no rental_duration. ` +
            `effectiveStart=${start.toISOString()}, ` +
            `customer=${tx.customer_name ?? 'unknown'}, ` +
            `room=${tx.apartment_location}/${tx.room_number}`
        )
    }

    return new Date(start.getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Is this stay active at the given `now` point in time?
 * active = now >= start AND now < end
 */
export function isStayActiveNow(tx: StayTransaction, now: Date = new Date()): boolean {
    const start = getEffectiveStart(tx)
    const end = getEstimatedEnd(tx)
    return now >= start && now < end
}

/**
 * Does this stay overlap the given period?
 * overlap = stayStart < period.endExclusive AND stayEnd > period.start
 */
export function doesStayOverlapPeriod(
    tx: StayTransaction,
    period: StayPeriod
): boolean {
    const start = getEffectiveStart(tx)
    const end = getEstimatedEnd(tx)
    const periodStart = new Date(period.startISO)
    const periodEnd = new Date(period.endExclusiveISO)
    return start < periodEnd && end > periodStart
}

/**
 * For daily occupancy (room-day): does this stay overlap a specific calendar day?
 * dayStart/End should be in the same timezone (WIB).
 */
export function doesStayOverlapDay(
    tx: StayTransaction,
    dayStart: Date,
    dayEndExclusive: Date
): boolean {
    const start = getEffectiveStart(tx)
    const end = getEstimatedEnd(tx)
    return start < dayEndExclusive && end > dayStart
}

/**
 * Build a canonical room key for deduplication.
 */
export function buildRoomKey(location: string, roomNumber: string): string {
    return `${location}|${roomNumber}`
}

// ============================================================
// Active stay query — central source of truth
// ============================================================

/**
 * Fetch ALL currently active stays from Supabase.
 * Uses canonical active logic: now >= start AND now < end.
 *
 * Fetches candidates using a wide OR filter then filters in JS
 * for correctness (timezone-aware comparison).
 */
export async function getLiveActiveStays(
    options?: {
        supabase?: ServerSupabaseClient
        now?: Date
    }
): Promise<ActiveStay[]> {
    const supabase = options?.supabase ?? createServerClient()
    const now = options?.now ?? new Date()

    // Fetch enough data to cover any active stay (7-day lookback)
    const lookback = new Date(now)
    lookback.setDate(lookback.getDate() - 7)
    const lookbackISO = lookback.toISOString()
    const nowISO = now.toISOString()

    // Catch ALL candidates: checkin_at recent, created_at recent, checkout_at null (still open), checkout_at future
    const { data, error } = await supabase
        .from('transactions')
        .select('id, created_at, checkin_at, checkout_at, rental_duration, apartment_location, room_number, customer_name')
        .or(
            `checkin_at.gte.${lookbackISO},` +
            `created_at.gte.${lookbackISO},` +
            `checkout_at.is.null,` +
            `checkout_at.gte.${nowISO}`
        )
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[stays] getLiveActiveStays error:', error)
        return []
    }

    if (process.env.NODE_ENV === 'development') {
        console.debug('[Unit Runtime Debug]', {
            today: nowISO,
            lookbackStart: lookbackISO,
            totalCandidates: data?.length ?? 0,
            allCandidates: data?.map((tx: any) => ({
                id: tx.id,
                customer_name: tx.customer_name,
                location: tx.apartment_location,
                room_number: tx.room_number,
                checkin_at: tx.checkin_at,
                created_at: tx.created_at,
                checkout_at: tx.checkout_at,
                rental_duration: tx.rental_duration,
            })),
        })
    }

    const active: ActiveStay[] = []

    for (const tx of (data ?? []) as StayTransaction[]) {
        const isActive = isStayActiveNow(tx, now)

        if (process.env.NODE_ENV === 'development') {
            console.debug('[Stays Debug]', {
                txId: tx.id,
                customerName: tx.customer_name,
                location: tx.apartment_location,
                roomNumber: tx.room_number,
                effectiveStart: getEffectiveStart(tx).toISOString(),
                estimatedEnd: getEstimatedEnd(tx).toISOString(),
                now: nowISO,
                isActive,
                reason: !isActive
                    ? (tx.checkout_at
                        ? 'checked out'
                        : now < getEffectiveStart(tx)
                            ? 'not yet started (future check-in)'
                            : 'ended (past end time)')
                    : 'ACTIVE',
            })
        }

        if (!isActive) continue

        const start = getEffectiveStart(tx)
        const end = getEstimatedEnd(tx)

        active.push({
            transactionId: tx.id,
            location: tx.apartment_location,
            roomNumber: tx.room_number,
            customerName: tx.customer_name,
            checkinAt: tx.checkin_at ?? tx.created_at,
            effectiveCheckinAt: start.toISOString(),
            estimatedCheckoutAt: end.toISOString(),
            rentalDuration: tx.rental_duration,
        })
    }

    // Sort by effectiveCheckinAt descending (newest first)
    active.sort((a, b) => new Date(b.effectiveCheckinAt).getTime() - new Date(a.effectiveCheckinAt).getTime())

    return active
}

// ============================================================
// Today check-in helper
// ============================================================

/**
 * Fetch transactions whose EFFECTIVE start date falls within today (WIB).
 * Uses calendar-day boundaries (00:00–23:59 WIB) via getReportPeriodRange.
 * JS-side filtering for correctness.
 */
export async function getTodayCheckins(
    options?: {
        supabase?: ServerSupabaseClient
        now?: Date
    }
): Promise<StayTransaction[]> {
    const supabase = options?.supabase ?? createServerClient()
    const now = options?.now ?? new Date()

    // Calendar-day boundaries for today in WIB
    const range = getReportPeriodRange({ preset: 'today', mode: 'calendar_day' })
    const startISO = range.startISO
    const endExclusiveISO = range.endExclusiveISO

    const { data, error } = await supabase
        .from('transactions')
        .select('id, created_at, checkin_at, checkout_at, rental_duration, apartment_location, room_number, customer_name')
        // Include transactions whose checkin_at is today, OR
        // whose created_at is today (for transactions without checkin_at)
        .or(
            `checkin_at.gte.${startISO},and(checkin_at.is.null,created_at.gte.${startISO})`
        )

    if (error) {
        console.error('[stays] getTodayCheckins error:', error)
        return []
    }

    const items = (data ?? []) as StayTransaction[]

    // Filter by effective start date within today
    const todayStart = new Date(startISO)
    const todayEnd = new Date(endExclusiveISO)

    return items.filter((tx) => {
        const start = getEffectiveStart(tx)
        return start >= todayStart && start < todayEnd
    })
}

// ============================================================
// Today check-out helper
// ============================================================

/**
 * Fetch transactions whose effective checkout falls within today (WIB).
 * Uses COALESCE(checkout_at, derived_checkout_at) for effective end time.
 * Calendar-day boundaries via getReportPeriodRange.
 * JS-side filtering for correctness.
 */
export async function getTodayCheckouts(
    options?: {
        supabase?: ServerSupabaseClient
        now?: Date
    }
): Promise<StayTransaction[]> {
    const supabase = options?.supabase ?? createServerClient()
    const now = options?.now ?? new Date()

    // Calendar-day boundaries for today in WIB
    const range = getReportPeriodRange({ preset: 'today', mode: 'calendar_day' })
    const startISO = range.startISO
    const endExclusiveISO = range.endExclusiveISO

    // Wide filter: checkout_at >= startISO OR potential checkout today (active stays)
    const { data, error } = await supabase
        .from('transactions')
        .select('id, created_at, checkin_at, checkout_at, rental_duration, apartment_location, room_number, customer_name')
        .or(
            `checkout_at.gte.${startISO},` +
            `and(checkout_at.is.null,checkin_at.gte.${startISO})`
        )

    if (error) {
        console.error('[stays] getTodayCheckouts error:', error)
        return []
    }

    const items = (data ?? []) as StayTransaction[]
    const todayStart = new Date(startISO)
    const todayEnd = new Date(endExclusiveISO)

    return items.filter((tx) => {
        // Derive effective end: checkout_at OR checkin_at + rental_duration hours
        const effectiveEnd = tx.checkout_at
            ? new Date(tx.checkout_at)
            : tx.checkin_at
                ? new Date(new Date(tx.checkin_at).getTime() + (tx.rental_duration ?? 24) * 60 * 60 * 1000)
                : null
        if (!effectiveEnd) return false
        return effectiveEnd >= todayStart && effectiveEnd < todayEnd
    })
}

// ============================================================
// Upcoming check-out helper
// ============================================================

/**
 * Fetch active stays that will check out in the future, sorted by
 * estimated checkout time ascending (nearest first).
 */
export async function getUpcomingCheckouts(
    options?: {
        supabase?: ServerSupabaseClient
        now?: Date
        limit?: number
    }
): Promise<ActiveStay[]> {
    const active = await getLiveActiveStays({
        supabase: options?.supabase,
        now: options?.now,
    })

    const now = options?.now ?? new Date()

    // Filter: stay is active now AND estimated end is in the future
    const upcoming = active.filter((stay) => {
        const end = new Date(stay.estimatedCheckoutAt)
        return end > now
    })

    // Sort by estimatedCheckoutAt ascending (nearest first)
    upcoming.sort(
        (a, b) => new Date(a.estimatedCheckoutAt).getTime() - new Date(b.estimatedCheckoutAt).getTime()
    )

    return options?.limit ? upcoming.slice(0, options.limit) : upcoming
}

// ============================================================
// Active stays by location — for unit page
// ============================================================

export interface LocationActiveSummary {
    location: string
    totalRooms: number
    occupiedRooms: number
    availableRooms: number
    occupancyRate: number
    activeGuests: ActiveStay[]
}

/**
 * Get active stay summary per location.
 * Total rooms come from nomor_kamar table.
 */
export async function getLocationActiveSummaries(
    options?: {
        supabase?: ServerSupabaseClient
        now?: Date
    }
): Promise<LocationActiveSummary[]> {
    const supabase = options?.supabase ?? createServerClient()
    const now = options?.now ?? new Date()

    // Get total rooms per location
    const { data: rooms, error: roomError } = await supabase
        .from('nomor_kamar')
        .select('lokasi, name')

    if (roomError) {
        console.error('[stays] getLocationActiveSummaries room error:', roomError)
        return []
    }

    // Count total rooms per location
    const totalPerLocation: Record<string, number> = {}
    // Also track unique room names per location for matching
    const roomNamesPerLocation: Record<string, Set<string>> = {}
    for (const room of (rooms ?? []) as Array<{ lokasi: string; name: string }>) {
        const loc = room.lokasi?.trim() || ''
        totalPerLocation[loc] = (totalPerLocation[loc] ?? 0) + 1
        if (!roomNamesPerLocation[loc]) roomNamesPerLocation[loc] = new Set()
        roomNamesPerLocation[loc].add(room.name?.trim() || '')
    }

    // Get active stays — deduplicated by room (latest per room)
    const activeStays = await getLiveActiveStays({ supabase, now })

    // Deduplicate: keep only the latest active stay per room
    const latestPerRoom = new Map<string, ActiveStay>()
    for (const stay of activeStays) {
        const key = buildRoomKey(stay.location, stay.roomNumber)
        const existing = latestPerRoom.get(key)
        if (!existing || new Date(stay.effectiveCheckinAt) > new Date(existing.effectiveCheckinAt)) {
            latestPerRoom.set(key, stay)
        }
    }

    // Build location summaries
    const summaryMap = new Map<string, LocationActiveSummary>()

    for (const [loc, total] of Object.entries(totalPerLocation)) {
        const locationOccupied = new Set<string>()
        const locationGuests: ActiveStay[] = []

        for (const [key, stay] of latestPerRoom) {
            if (stay.location === loc || stay.location?.trim() === loc) {
                const roomClean = stay.roomNumber?.trim() || ''
                // Only count if the room number exists in this location's room list
                if (roomNamesPerLocation[loc]?.has(roomClean)) {
                    locationOccupied.add(roomClean)
                    locationGuests.push(stay)
                }
            }
        }

        const occupied = locationOccupied.size
        const available = Math.max(0, total - occupied)
        const rate = total > 0 ? Math.min(100, Math.round((occupied / total) * 100)) : 0

        summaryMap.set(loc, {
            location: loc,
            totalRooms: total,
            occupiedRooms: occupied,
            availableRooms: available,
            occupancyRate: rate,
            activeGuests: locationGuests,
        })
    }

    return Array.from(summaryMap.values())
}