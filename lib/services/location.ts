import { createServerClient } from '@/lib/supabase/server';

// ============================================================
// lib/services/location.ts
//
// Location-related service functions extracted from:
//   - booking/actions.ts  → fetchLocations()
//   - unit/actions.ts     → fetchUnitLocations()
// ============================================================

export interface LocationItem {
    name: string;
    totalRooms: number;
}

// ============================================================
// getLocations()
//
// Get all apartment locations with room counts.
//
// Mirrors fetchLocations() in booking/actions.ts:123-141 +
// fetchUnitLocations() in unit/actions.ts:205-222
// ============================================================
export async function getLocations(): Promise<LocationItem[]> {
    const supabase = createServerClient();

    try {
        const { data, error } = await supabase
            .from('lokasi_apartemen')
            .select('name, total_rooms')
            .order('name');

        if (error) {
            console.error('Error fetching locations:', error);
            return [];
        }

        return (data || []).map((loc: any) => ({
            name: loc.name,
            totalRooms: loc.total_rooms || 0,
        }));
    } catch (error) {
        console.error('Error in getLocations:', error);
        return [];
    }
}
