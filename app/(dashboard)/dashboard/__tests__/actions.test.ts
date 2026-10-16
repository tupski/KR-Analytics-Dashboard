/**
 * Tests for dashboard server actions
 *
 * Covers `fetchUnitStatus()`, which now delegates to the cached
 * `getLiveOccupancy()` service (lib/services/occupancy.ts) and maps its
 * result onto the two-field `UnitStatusCounts` contract.
 *
 * NOTE (Phase 0, test-infra sync): the historical version of this file mocked
 * a direct `supabase.from('unit_apartment').select('status')` query and a
 * four-status result (tersedia/ditempati/cleaning/maintenance). The action was
 * refactored to use `getLiveOccupancy()` and `UnitStatusCounts` was reduced to
 * `{ tersedia, ditempati }`. The mocks below were updated to the current
 * contract; coverage intent (correct counts, zero counts, error propagation)
 * is preserved.
 *
 * The action is imported statically (the `vi.mock` factory is hoisted above
 * it). A previous dynamic `import('../actions')` + `vi.resetModules()` per test
 * re-evaluated the whole dashboard module graph repeatedly and timed out under
 * parallel load; a single static import avoids that without weakening coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetLiveOccupancy } = vi.hoisted(() => ({
    mockGetLiveOccupancy: vi.fn(),
}));

vi.mock('@/lib/services/occupancy', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/services/occupancy')>();
    return {
        ...actual,
        getLiveOccupancy: mockGetLiveOccupancy,
    };
});

import { fetchUnitStatus } from '../actions';

describe('fetchUnitStatus', () => {
    beforeEach(() => {
        mockGetLiveOccupancy.mockReset();
    });

    it('maps the occupancy service result onto tersedia/ditempati', async () => {
        mockGetLiveOccupancy.mockResolvedValue({
            tersedia: 2,
            ditempati: 5,
            total: 7,
        });

        const result = await fetchUnitStatus();

        expect(result).toEqual({ tersedia: 2, ditempati: 5 });
        expect(mockGetLiveOccupancy).toHaveBeenCalledTimes(1);
    });

    it('returns zero counts when no units exist', async () => {
        mockGetLiveOccupancy.mockResolvedValue({
            tersedia: 0,
            ditempati: 0,
            total: 0,
        });

        const result = await fetchUnitStatus();

        expect(result).toEqual({ tersedia: 0, ditempati: 0 });
    });

    it('propagates errors thrown by the occupancy service', async () => {
        mockGetLiveOccupancy.mockRejectedValue(new Error('Failed to fetch unit status'));

        await expect(fetchUnitStatus()).rejects.toThrow('Failed to fetch unit status');
    });
});
