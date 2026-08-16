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
import { requireUser, requireAdmin, isGuardError } from '@/lib/security/guard';
import {
    rateLimit,
    userOrIpKey,
    getClientIp,
    rateLimitResponse,
} from '@/lib/security/rate-limit';

// KRAI history save protection: 60 message-writes per user per minute.
const HISTORY_RATE_LIMIT = 60;
const HISTORY_RATE_WINDOW_MS = 60 * 1000;

/**
 * Maximum allowed message payload size for a single upsert (bytes).
 * Prevents oversized JSONB writes. 50 KB is generous for a single conversation save.
 */
const MAX_MESSAGES_PAYLOAD_BYTES = 50 * 1024; // 50 KB

/**
 * Encode a conversation ID into a deterministic per-user scoped key.
 * The krai_conversations table has no user_id column (global scope), so we
 * prefix the client-supplied id with the authenticated user's id to ensure
 * each user can only read/write their own conversations.
 *
 * Format: "<userId>__<rawId>"
 * Callers that pass a full scoped id (e.g. after a list) will already have
 * the correct format and can be used directly in DB queries.
 */
function scopedId(userId: string, rawId: string): string {
    // If the id already starts with this user's prefix, use as-is (idempotent)
    const prefix = `${userId}__`;
    if (rawId.startsWith(prefix)) return rawId;
    return `${prefix}${rawId}`;
}

/**
 * GET /api/krai/history                  — list all conversations (no messages)
 * GET /api/krai/history?id=xxx           — get single conversation with messages
 * GET /api/krai/history?id=xxx&new=1     — skip DB, return empty (fresh conversation)
 * GET /api/krai/history?action=settings  — get krai settings
 */
export async function GET(request: NextRequest) {
    try {
        const guard = await requireUser();
        if (isGuardError(guard)) return guard;

        const userId = guard.user.id;
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const action = searchParams.get('action');
        const isNew = searchParams.get('new') === '1';

        if (action === 'settings') {
            const retentionDays = await getRetentionDays();
            return NextResponse.json({ retentionDays });
        }

        if (id) {
            // Scope the conversation id to the authenticated user
            const ownedId = scopedId(userId, id);

            // new=1 means this is a fresh conversation — skip DB, return empty
            if (isNew) {
                console.debug('[KRAI History API]', {
                    method: 'GET',
                    id: ownedId,
                    mode: 'new',
                    foundConversation: false,
                    messageCount: 0,
                });
                return NextResponse.json({ ok: true, conversationId: ownedId, messages: [] });
            }

            const conversation = await getConversationDb(ownedId);
            const messages = conversation?.messages ?? [];

            console.debug('[KRAI History API]', {
                method: 'GET',
                id: ownedId,
                mode: 'messages',
                foundConversation: !!conversation,
                messageCount: messages.length,
            });

            // Conversation exists in DB but has no messages yet → return empty gracefully
            if (conversation && messages.length === 0) {
                return NextResponse.json({ ok: true, conversationId: id, messages: [] });
            }

            // Conversation not found in DB → 404
            if (!conversation) {
                return NextResponse.json({ error: 'Not found' }, { status: 404 });
            }

            return NextResponse.json({ conversation });
        }

        // List only conversations that belong to this user (id prefix filter)
        const allConversations = await listConversationsDb();
        const userPrefix = `${userId}__`;
        const conversations = allConversations.filter(c => c.id.startsWith(userPrefix));
        return NextResponse.json({ conversations });
    } catch (err: any) {
        console.error('GET /api/krai/history error:', err);
        return NextResponse.json(
            { ok: false, error: 'Gagal memuat riwayat chat.' },
            { status: 500 },
        );
    }
}

/**
 * POST /api/krai/history
 * Body actions:
 *   { action: 'upsert', id, title, messages }
 *   { action: 'rename', id, title }
 *   { action: 'delete', id }
 *   { action: 'prune' }           — admin only
 *   { action: 'save_settings', retentionDays } — admin only
 */
export async function POST(request: NextRequest) {
    try {
        const guard = await requireUser();
        if (isGuardError(guard)) return guard;

        const userId = guard.user.id;

        // Rate limiting for message-writes (per audit P0-1).
        const clientIp = getClientIp(request);
        const historyLimit = rateLimit({
            namespace: 'krai:history',
            limit: HISTORY_RATE_LIMIT,
            windowMs: HISTORY_RATE_WINDOW_MS,
            key: userOrIpKey(userId, clientIp),
        });
        if (!historyLimit.allowed) {
            return rateLimitResponse(
                historyLimit,
                'Terlalu banyak permintaan riwayat chat. Silakan tunggu sebentar.',
            );
        }

        // Enforce body size limit before parsing JSON to prevent oversized payloads.
        const contentLength = Number(request.headers.get('content-length') ?? 0);
        if (contentLength > MAX_MESSAGES_PAYLOAD_BYTES) {
            return NextResponse.json(
                { error: 'Payload terlalu besar. Maksimum 50KB.' },
                { status: 413 },
            );
        }

        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'upsert': {
                const { id, title, messages } = body;
                if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                // Scope conversation ID to this user to prevent IDOR
                const ownedId = scopedId(userId, id);
                // Validate messages payload size as a second line of defense
                const messagesJson = JSON.stringify(messages ?? []);
                if (Buffer.byteLength(messagesJson, 'utf8') > MAX_MESSAGES_PAYLOAD_BYTES) {
                    return NextResponse.json(
                        { error: 'Messages payload terlalu besar. Maksimum 50KB.' },
                        { status: 413 },
                    );
                }
                await upsertConversationDb({ id: ownedId, title: title || 'Percakapan baru', messages: messages || [] });
                return NextResponse.json({ ok: true, conversationId: ownedId });
            }
            case 'rename': {
                const { id, title } = body;
                if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                // Only allow renaming conversations owned by this user
                const ownedId = scopedId(userId, id);
                await renameConversationDb(ownedId, title || 'Percakapan');
                return NextResponse.json({ ok: true });
            }
            case 'delete': {
                const { id } = body;
                if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                // Only allow deleting conversations owned by this user
                const ownedId = scopedId(userId, id);
                await deleteConversationDb(ownedId);
                return NextResponse.json({ ok: true });
            }
            case 'prune': {
                // Prune is a privileged operation — require admin role
                const adminGuard = await requireAdmin();
                if (isGuardError(adminGuard)) return adminGuard;
                const deleted = await pruneOldConversations();
                return NextResponse.json({ ok: true, deleted });
            }
            case 'save_settings': {
                // Settings mutation is a privileged operation — require admin role
                const adminGuard = await requireAdmin();
                if (isGuardError(adminGuard)) return adminGuard;
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
        return NextResponse.json(
            { ok: false, error: 'Gagal menyimpan riwayat chat.' },
            { status: 500 },
        );
    }
}
