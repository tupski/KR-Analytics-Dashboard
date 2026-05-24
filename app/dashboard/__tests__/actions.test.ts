/**
 * Tests for dashboard server actions
 * 
 * These tests verify that the server actions work correctly
 * and handle data fetching appropriately.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UnitStatusCounts } from '@/types/dashboard';

// Mock the Supabase server client
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
    select: mockSelect
}));

vi.mock('@/lib/supabase/server', () => ({
    createServerClient: vi.fn(() => ({
        from: mockFrom
    }))
}));

describe('fetchUnitStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('should return correct unit status counts', async () => {
        const mockData = [
            { status: 'tersedia' },
            { status: 'tersedia' },
            { status: 'ditempati' },
            { status: 'cleaning' },
            { status: 'maintenance' },
            { status: 'maintenance' },
            { status: 'maintenance' }
        ];

        mockSelect.mockResolvedValue({
            data: mockData,
            error: null
        });

        const { fetchUnitStatus } = await import('../actions');
        const result = await fetchUnitStatus();

        expect(result).toEqual({
            tersedia: 2,
            ditempati: 1,
            cleaning: 1,
            maintenance: 3
        });

        expect(mockFrom).toHaveBeenCalledWith('unit_apartemen');
        expect(mockSelect).toHaveBeenCalledWith('status');
    });

    it('should return zero counts when no units exist', async () => {
        mockSelect.mockResolvedValue({
            data: [],
            error: null
        });

        const { fetchUnitStatus } = await import('../actions');
        const result = await fetchUnitStatus();

        expect(result).toEqual({
            tersedia: 0,
            ditempati: 0,
            cleaning: 0,
            maintenance: 0
        });
    });

    it('should handle null data gracefully', async () => {
        mockSelect.mockResolvedValue({
            data: null,
            error: null
        });

        const { fetchUnitStatus } = await import('../actions');
        const result = await fetchUnitStatus();

        expect(result).toEqual({
            tersedia: 0,
            ditempati: 0,
            cleaning: 0,
            maintenance: 0
        });
    });

    it('should throw error when database query fails', async () => {
        mockSelect.mockResolvedValue({
            data: null,
            error: { message: 'Database connection failed', code: 'PGRST301' }
        });

        const { fetchUnitStatus } = await import('../actions');

        await expect(fetchUnitStatus()).rejects.toThrow('Failed to fetch unit status');
    });

    it('should ignore units with invalid status values', async () => {
        const mockData = [
            { status: 'tersedia' },
            { status: 'invalid_status' },
            { status: 'ditempati' },
            { status: 'unknown' }
        ];

        mockSelect.mockResolvedValue({
            data: mockData,
            error: null
        });

        const { fetchUnitStatus } = await import('../actions');
        const result = await fetchUnitStatus();

        expect(result).toEqual({
            tersedia: 1,
            ditempati: 1,
            cleaning: 0,
            maintenance: 0
        });
    });

    it('should handle all status types correctly', async () => {
        const mockData = [
            { status: 'tersedia' },
            { status: 'ditempati' },
            { status: 'cleaning' },
            { status: 'maintenance' }
        ];

        mockSelect.mockResolvedValue({
            data: mockData,
            error: null
        });

        const { fetchUnitStatus } = await import('../actions');
        const result = await fetchUnitStatus();

        expect(result).toEqual({
            tersedia: 1,
            ditempati: 1,
            cleaning: 1,
            maintenance: 1
        });
    });
});
