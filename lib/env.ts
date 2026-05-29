/**
 * Environment variable validation and type-safe access
 * 
 * This module validates that all required environment variables are present
 * and provides type-safe access to them throughout the application.
 */

/**
 * Server-side environment variables
 * These are only available in server-side code (Server Components, Server Actions, API Routes)
 */
export const serverEnv = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

/**
 * Client-side environment variables
 * These are safe to expose to the browser and are available in both client and server code
 */
export const clientEnv = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
} as const;

/**
 * Validates that all required server-side environment variables are present
 * 
 * @throws Error if any required environment variables are missing
 */
export function validateServerEnv(): void {
    const missing: string[] = [];

    if (!serverEnv.supabaseUrl) {
        missing.push('NEXT_PUBLIC_SUPABASE_URL');
    }

    if (!serverEnv.supabaseServiceRoleKey) {
        missing.push('SUPABASE_SERVICE_ROLE_KEY');
    }

    // ANALYTICS_DATABASE_URL is optional — analytics has fallback
    if (!process.env.ANALYTICS_DATABASE_URL) {
        console.warn(
            '[env] ANALYTICS_DATABASE_URL not set — analytics will use fallback data'
        );
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing required server environment variables: ${missing.join(', ')}\n` +
            'Please ensure these are set in your .env.local file.\n' +
            'See .env.example for the required format.'
        );
    }

    // Validate that service role key is not accidentally exposed as a public variable
    if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
            'CRITICAL SECURITY ERROR: SUPABASE_SERVICE_ROLE_KEY is exposed as NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!\n' +
            'The service role key must NEVER be prefixed with NEXT_PUBLIC_ as this exposes it to the browser.\n' +
            'Please remove NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY from your environment variables and use SUPABASE_SERVICE_ROLE_KEY instead.'
        );
    }
}

/**
 * Validates that all required client-side environment variables are present
 * 
 * @throws Error if any required environment variables are missing
 */
export function validateClientEnv(): void {
    const missing: string[] = [];

    if (!clientEnv.supabaseUrl) {
        missing.push('NEXT_PUBLIC_SUPABASE_URL');
    }

    if (!clientEnv.supabaseAnonKey) {
        missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing required client environment variables: ${missing.join(', ')}\n` +
            'Please ensure these are set in your .env.local file.\n' +
            'See .env.example for the required format.'
        );
    }
}

/**
 * Type guard to check if we're running on the server
 */
export function isServer(): boolean {
    return typeof window === 'undefined';
}

/**
 * Type guard to check if we're running in development mode
 */
export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
}

/**
 * Type guard to check if we're running in production mode
 */
export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}
