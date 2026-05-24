/**
 * Tests for Supabase client utilities
 * 
 * These tests verify that the client creation functions work correctly
 * and handle missing environment variables appropriately.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Supabase Client Utilities', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // Reset environment variables before each test
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        // Restore original environment variables
        process.env = originalEnv;
    });

    describe('createServerClient', () => {
        it('should throw error when VITE_SUPABASE_URL is missing', async () => {
            delete process.env.VITE_SUPABASE_URL;
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

            const { createServerClient } = await import('../server');

            expect(() => createServerClient()).toThrow('Missing VITE_SUPABASE_URL');
        });

        it('should throw error when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
            process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;

            const { createServerClient } = await import('../server');

            expect(() => createServerClient()).toThrow('Missing SUPABASE_SERVICE_ROLE_KEY');
        });

        it('should create client when all environment variables are present', async () => {
            process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

            const { createServerClient } = await import('../server');

            expect(() => createServerClient()).not.toThrow();
        });
    });

    describe('createBrowserClient', () => {
        it('should throw error when SUPABASE_URL is missing', async () => {
            delete process.env.VITE_SUPABASE_URL;
            delete process.env.NEXT_PUBLIC_SUPABASE_URL;
            process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'test-key';

            const { createBrowserClient } = await import('../client');

            expect(() => createBrowserClient()).toThrow('Missing NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL');
        });

        it('should throw error when SUPABASE_ANON_KEY is missing', async () => {
            process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
            delete process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
            delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

            const { createBrowserClient } = await import('../client');

            expect(() => createBrowserClient()).toThrow('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
        });

        it('should create client when VITE environment variables are present', async () => {
            process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
            process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'test-anon-key';

            const { createBrowserClient } = await import('../client');

            expect(() => createBrowserClient()).not.toThrow();
        });

        it('should create client when NEXT_PUBLIC environment variables are present', async () => {
            process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

            const { createBrowserClient } = await import('../client');

            expect(() => createBrowserClient()).not.toThrow();
        });
    });
});
