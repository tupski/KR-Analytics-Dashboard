/**
 * Tests for Supabase client environment validation
 *
 * Verifies that `createServerClient()` / `createBrowserClient()` throw a
 * descriptive error when required environment variables are missing and
 * succeed when they are present.
 *
 * NOTE (Phase 0, test-infra sync): the historical version of this file used the
 * legacy `VITE_*` variable names and older error strings. `lib/env.ts` now
 * reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
 * `SUPABASE_SERVICE_ROLE_KEY`, and throws "Missing required server/client
 * environment variables: ...". The assertions were updated to the current
 * contract. `vi.resetModules()` is required because `lib/env.ts` captures
 * `process.env` at module-evaluation time.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Supabase Client Utilities', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // Re-evaluate lib/env.ts for each test so it re-reads process.env.
        vi.resetModules();
        process.env = { ...originalEnv };
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('createServerClient', () => {
        it('should throw error when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

            const { createServerClient } = await import('../server');

            expect(() => createServerClient()).toThrow('Missing required server environment variables');
        });

        it('should throw error when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

            const { createServerClient } = await import('../server');

            expect(() => createServerClient()).toThrow('Missing required server environment variables');
        });

        it('should create client when all environment variables are present', async () => {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

            const { createServerClient } = await import('../server');

            expect(() => createServerClient()).not.toThrow();
        });
    });

    describe('createBrowserClient', () => {
        it('should throw error when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

            const { createBrowserClient } = await import('../client');

            expect(() => createBrowserClient()).toThrow('Missing required client environment variables');
        });

        it('should throw error when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

            const { createBrowserClient } = await import('../client');

            expect(() => createBrowserClient()).toThrow('Missing required client environment variables');
        });

        it('should create client when all environment variables are present', async () => {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

            const { createBrowserClient } = await import('../client');

            expect(() => createBrowserClient()).not.toThrow();
        });
    });
});
