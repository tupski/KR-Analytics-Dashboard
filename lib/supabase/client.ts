'use client';

import { createClient } from '@supabase/supabase-js';
import { validateClientEnv, clientEnv } from '@/lib/env';

/**
 * Creates a Supabase client for browser/client-side operations using the anonymous key.
 * 
 * This client is safe to use in the browser as it only has access to data allowed by
 * Row Level Security (RLS) policies. It respects user authentication and authorization.
 * 
 * Use this client for:
 * - Real-time subscriptions in client components
 * - Client-side authentication flows
 * - Any browser-based Supabase operations
 * 
 * @returns Supabase client with anonymous key (RLS enforced)
 * @throws Error if required environment variables are missing
 */
export function createBrowserClient() {
    // Validate environment variables
    validateClientEnv();

    const supabaseUrl = clientEnv.supabaseUrl!;
    const supabaseAnonKey = clientEnv.supabaseAnonKey!;

    // Create Supabase client with anonymous key
    // This client respects Row Level Security policies
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
        },
    });

    return supabase;
}

/**
 * Type helper to extract the Supabase client type
 */
export type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;
