import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (!client) {
        client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
            auth: { persistSession: false },
        });
    }
    return client;
}
