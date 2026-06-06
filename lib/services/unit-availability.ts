import { createServerClient } from '@/lib/supabase/server';
import { getNowWIB } from '@/lib/utils/format';

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
 *
 * Uses timezone-aware WIB date via getNowWIB() — consistent with getLiveOccupancy().
 * Total room count uses ALL nomor_kamar (no is_active filter) to match getLiveOccupancy().
 */
export async function getUnitAvailability(
    options?: {
        periodStart?: string
        periodEnd?: string
        locationFilter?: string
    }
): Promise<UnitAvailabilityResult> {
    const supabase = createServerClient()

    // Default to today if no period specified — use timezone-aware WIB
    const nowWIB = getNowWIB()
    const todayWIB = nowWIB.split('T')[0] // "YYYY-MM-DD"
    const periodStart = options?.periodStart ?? `${todayWIB}T00:00:00.000+07:00`
    const periodEnd = options?.periodEnd ?? `${todayWIB}T23:59:59.999+07:00`

    // Get total units — same as getLiveOccupancy: count ALL nomor_kamar rows
    let roomsQuery = supabase
        .from('nomor_kamar')
        .select('id', { count: 'exact', head: true })

    if (options?.locationFilter) {
        roomsQuery = roomsQuery.eq('lokasi', options.locationFilter)
    }

    const { count: totalUnits, error: totalError } = await roomsQuery

    if (totalError) throw totalError

    // Get occupied rooms in period.
    // Overlap: checkin_at ≤ periodEnd AND (checkout_at ≥ periodStart OR checkout_at IS NULL)
    // Uses .lte() + .or() (correct: .lte() is a filter that ANDs, not a second .or())
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
