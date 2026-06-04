import { createServerClient } from '@/lib/supabase/server';

export interface UnitAvailabilityResult {
    totalUnits: number
    occupiedUnits: number
    availableUnits: number
    periodStart: string
    periodEnd: string
    breakdown?: {
        totalActiveUnits: number
        activeStays: number
    }
}

/**
 * Calculate unit availability for a given date/period.
 *
 * Business definition:
 *   Unit Tersedia = total unit aktif - unit yang sedang ditempati
 *
 * Unit is "ditempati" (occupied) if:
 *   checkin_at ≤ period_end AND (checkout_at ≥ period_start OR checkout_at IS NULL)
 *
 * This correctly handles:
 * - Active stays with future checkout
 * - Active stays with NULL checkout (no checkout recorded yet)
 * - Multi-day stays overlapping the period
 *
 * Deduplicates by apartment_location + room_number — a room with 2 overlapping
 * stays counts as 1 occupied unit.
 */
export async function getUnitAvailability(
    options?: {
        periodStart?: string
        periodEnd?: string
        locationFilter?: string
    }
): Promise<UnitAvailabilityResult> {
    const supabase = createServerClient()

    // Default to today if no period specified
    const now = new Date()
    const periodStart = options?.periodStart ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const periodEnd = options?.periodEnd ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

    // Get total active units
    let roomsQuery = supabase
        .from('nomor_kamar')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)

    if (options?.locationFilter) {
        roomsQuery = roomsQuery.eq('lokasi', options.locationFilter)
    }

    const { count: totalUnits, error: totalError } = await roomsQuery

    if (totalError) throw totalError

    // Get occupied rooms in period.
    // A room is occupied if checkin_at ≤ periodEnd AND (checkout_at ≥ periodStart OR checkout_at IS NULL)
    let occupiedQuery = supabase
        .from('transactions')
        .select('room_number, apartment_location')
        .lte('checkin_at', periodEnd)
        .or(`checkout_at.gte.${periodStart},checkout_at.is.null`)

    if (options?.locationFilter) {
        occupiedQuery = occupiedQuery.eq('apartment_location', options.locationFilter)
    }

    const { data: occupiedRooms, error: occupiedError } = await occupiedQuery

    if (occupiedError) throw occupiedError

    // Deduplicate by apartment_location + room_number (composite key)
    const uniqueOccupied = new Set(
        occupiedRooms?.map(r => `${r.apartment_location}-${r.room_number}`) ?? []
    ).size

    return {
        totalUnits: totalUnits ?? 0,
        occupiedUnits: uniqueOccupied,
        availableUnits: (totalUnits ?? 0) - uniqueOccupied,
        periodStart,
        periodEnd,
        breakdown: {
            totalActiveUnits: totalUnits ?? 0,
            activeStays: occupiedRooms?.length ?? 0,
        },
    }
}
