import { createClient } from '@supabase/supabase-js';
import { validateServerEnv, serverEnv } from '@/lib/env';

/**
 * Creates a Supabase client for server-side operations using the service role key.
 * 
 * SECURITY WARNING: This client has elevated privileges and bypasses Row Level Security (RLS).
 * It should ONLY be used in server-side code (Server Components, Server Actions, API Routes).
 * NEVER expose this client or the service role key to the browser.
 * 
 * @returns Supabase client with service role privileges
 * @throws Error if required environment variables are missing
 */
export function createServerClient() {
    // Validate environment variables
    validateServerEnv();

    const supabaseUrl = serverEnv.supabaseUrl!;
    const supabaseServiceRoleKey = serverEnv.supabaseServiceRoleKey!;

    // Create Supabase client with service role key
    // This client bypasses Row Level Security and has full database access
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    return supabase;
}

/**
 * Type helper to extract the Supabase client type
 */
export type ServerSupabaseClient = ReturnType<typeof createServerClient>;
