import { NextRequest, NextResponse } from 'next/server';
import {
    listConversationsDb,
    getConversationDb,
    upsertConversationDb,
    renameConversationDb,
    deleteConversationDb,
    pruneOldConversations,
    getRetentionDays,
    setKraiSetting,
} from '@/lib/ai/historyServer';

/**
 * GET /api/krai/history            — list all conversations (no messages)
 * GET /api/krai/history?id=xxx     — get single conversation with messages
 * GET /api/krai/history?action=settings — get krai settings
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const action = searchParams.get('action');

        if (action === 'settings') {
            const retentionDays = await getRetentionDays();
            return NextResponse.json({ retentionDays });
        }

        if (id) {
            const conv = await getConversationDb(id);
            if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
            return NextResponse.json({ conversation: conv });
        }

        const conversations = await listConversationsDb();
        return NextResponse.json({ conversations });
    } catch (err: any) {
        console.error('GET /api/krai/history error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * POST /api/krai/history
 * Body actions:
 *   { action: 'upsert', id, title, messages }
 *   { action: 'rename', id, title }
 *   { action: 'delete', id }
 *   { action: 'prune' }
 *   { action: 'save_settings', retentionDays }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'upsert': {
                const { id, title, messages } = body;
                if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                await upsertConversationDb({ id, title: title || 'Percakapan baru', messages: messages || [] });
                return NextResponse.json({ ok: true });
            }
            case 'rename': {
                const { id, title } = body;
                if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                await renameConversationDb(id, title || 'Percakapan');
                return NextResponse.json({ ok: true });
            }
            case 'delete': {
                const { id } = body;
                if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                await deleteConversationDb(id);
                return NextResponse.json({ ok: true });
            }
            case 'prune': {
                const deleted = await pruneOldConversations();
                return NextResponse.json({ ok: true, deleted });
            }
            case 'save_settings': {
                const { retentionDays } = body;
                if (typeof retentionDays === 'number' && retentionDays > 0) {
                    await setKraiSetting('chat_retention_days', retentionDays);
                }
                return NextResponse.json({ ok: true });
            }
            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (err: any) {
        console.error('POST /api/krai/history error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
