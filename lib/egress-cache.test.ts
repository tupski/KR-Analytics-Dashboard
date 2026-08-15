import { describe, it, expect, beforeEach } from 'vitest';
import {
    getCached,
    setCached,
    withEgressCache,
    clearEgressCache,
    cacheSize,
    egressCacheKey,
} from './egress-cache';

describe('egress-cache', () => {
    beforeEach(() => clearEgressCache());

    it('set/get round-trips a value within TTL', () => {
        setCached('k1', { a: 1 }, 1000);
        expect(getCached('k1')).toEqual({ a: 1 });
    });

    it('expires after TTL', async () => {
        setCached('k2', 'v', 5);
        expect(getCached('k2')).toBe('v');
        await new Promise(r => setTimeout(r, 15));
        expect(getCached('k2')).toBeUndefined();
    });

    it('withEgressCache computes once, then hits cache', async () => {
        let calls = 0;
        const fn = async () => {
            calls++;
            return { n: calls };
        };
        const a = await withEgressCache('k3', 1000, fn);
        const b = await withEgressCache('k3', 1000, fn);
        expect(calls).toBe(1);
        expect(a).toEqual({ n: 1 });
        expect(b).toEqual({ n: 1 });
    });

    it('evicts oldest when over capacity', async () => {
        // Max entries = 200; fill past it.
        for (let i = 0; i < 205; i++) {
            setCached(`bulk-${i}`, i, 60_000);
        }
        expect(cacheSize()).toBe(200);
        expect(getCached('bulk-0')).toBeUndefined(); // oldest evicted
        expect(getCached('bulk-204')).toBe(204); // newest present
    });

    it('key builder distinguishes ranges', () => {
        expect(egressCacheKey('t', 'scan', '2026-01-01', '2026-01-31', 'calendar_day')).not.toBe(
            egressCacheKey('t', 'scan', '2026-01-01', '2026-02-01', 'calendar_day'),
        );
        expect(egressCacheKey('pengeluaran', 'scan', 'A', 'B')).toBe(
            egressCacheKey('pengeluaran', 'scan', 'A', 'B'),
        );
    });
});
