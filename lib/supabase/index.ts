/**
 * Supabase client utilities
 * 
 * This module exports functions to create Supabase clients for different contexts:
 * - Server-side: Use createServerClient() with service role key
 * - Browser-side: Use createBrowserClient() with anonymous key
 * 
 * @see README.md for usage examples and security best practices
 */

export { createServerClient } from './server';
export { createBrowserClient } from './client';

export type { ServerSupabaseClient } from './server';
export type { BrowserSupabaseClient } from './client';
