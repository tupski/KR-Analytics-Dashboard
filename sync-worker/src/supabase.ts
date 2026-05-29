import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import ws from 'ws';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (!client) {
        client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
            auth: { persistSession: false },
            realtime: {
                transport: ws as any,
            },
        });
    }
    return client;
}
