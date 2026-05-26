 /**
 * Server-side KR·AI chat history storage in Supabase.
 * Used only in API Routes (server-side).
 */

import { createServerClient } from '@/lib/supabase/server';
import type { ChatMessage } from '@/components/ai/AIChatCore';

const SCOPE = 'global';

export interface DbConversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getKraiSetting(key: string): Promise<number | string | object | null> {
    const supabase = createServerClient();
    const { data } = await supabase
        .from('krai_settings')
        .select('value')
        .eq('key', key)
        .single();
    return data?.value ?? null;
}

export async function setKraiSetting(key: string, value: number | string | object): Promise<void> {
    const supabase = createServerClient();
    await supabase
        .from('krai_settings')
        .upsert({ key, value }, { onConflict: 'key' });
}

export async function getRetentionDays(): Promise<number> {
    const val = await getKraiSetting('chat_retention_days');
    const n = typeof val === 'number' ? val : parseInt(String(val ?? '30'), 10);
    return Number.isNaN(n) ? 30 : Math.max(1, n);
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function listConversationsDb(): Promise<DbConversation[]> {
    const supabase = createServerClient();
    const { data } = await supabase
        .from('krai_conversations')
        .select('id, title, created_at, updated_at')
        .eq('scope', SCOPE)
        .order('updated_at', { ascending: false })
        .limit(100);

    return (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        messages: [],           // not loaded in list view
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
}

export async function getConversationDb(id: string): Promise<DbConversation | null> {
    const supabase = createServerClient();
    const { data } = await supabase
        .from('krai_conversations')
        .select('id, title, messages, created_at, updated_at')
        .eq('id', id)
        .single();

    if (!data) return null;
    return {
        id: data.id,
        title: data.title,
        messages: (data.messages || []) as ChatMessage[],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}

export async function upsertConversationDb(conv: {
    id: string;
    title: string;
    messages: ChatMessage[];
}): Promise<void> {
    const supabase = createServerClient();

    // Limit messages stored to avoid JSONB bloat: keep last 200 messages
    const capped = conv.messages.slice(-200);

    await supabase
        .from('krai_conversations')
        .upsert({
            id: conv.id,
            scope: SCOPE,
            title: conv.title,
            messages: capped,
        }, { onConflict: 'id' });
}

export async function renameConversationDb(id: string, title: string): Promise<void> {
    const supabase = createServerClient();
    await supabase
        .from('krai_conversations')
        .update({ title: title.trim() || 'Percakapan' })
        .eq('id', id);
}

export async function deleteConversationDb(id: string): Promise<void> {
    const supabase = createServerClient();
    await supabase
        .from('krai_conversations')
        .delete()
        .eq('id', id);
}

/** Delete conversations older than retention_days */
export async function pruneOldConversations(): Promise<number> {
    const supabase = createServerClient();
    const days = await getRetentionDays();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { data, error } = await supabase
        .from('krai_conversations')
        .delete()
        .eq('scope', SCOPE)
        .lt('updated_at', cutoff)
        .select('id');

    if (error) {
        console.error('pruneOldConversations error:', error);
        return 0;
    }
    return data?.length ?? 0;
}
