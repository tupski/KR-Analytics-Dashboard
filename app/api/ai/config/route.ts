import { NextRequest, NextResponse } from 'next/server';
import {
    loadAllProviderConfigs,
    upsertProviderConfig,
    deleteProviderConfig,
    setActiveProvider,
    setThinkingModeDb,
} from '@/lib/ai/configServer';
import type { ProviderId } from '@/lib/ai/models';

/**
 * GET /api/ai/config
 * Returns all configured providers (api keys are masked).
 */
export async function GET() {
    try {
        const configs = await loadAllProviderConfigs();
        // Mask API keys before sending to client — only send first 4 + last 4 chars
        const masked = configs.map(c => ({
            ...c,
            apiKey: c.apiKey.length > 8
                ? c.apiKey.slice(0, 4) + '••••••••' + c.apiKey.slice(-4)
                : '••••••••',
            apiKeySet: true,
        }));
        return NextResponse.json({ configs: masked });
    } catch (err: any) {
        console.error('GET /api/ai/config error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * POST /api/ai/config
 * Body: { action: 'upsert' | 'delete' | 'setActive' | 'setThinking', ...payload }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'upsert': {
                const { providerId, apiKey, model, baseUrl, isActive } = body;
                if (!providerId || !apiKey) {
                    return NextResponse.json({ error: 'providerId and apiKey are required' }, { status: 400 });
                }
                await upsertProviderConfig({ providerId, apiKey, model, baseUrl, isActive });
                return NextResponse.json({ ok: true });
            }
            case 'delete': {
                const { providerId } = body;
                if (!providerId) {
                    return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
                }
                await deleteProviderConfig(providerId as ProviderId);
                return NextResponse.json({ ok: true });
            }
            case 'setActive': {
                const { providerId, modelId } = body;
                if (!providerId) {
                    return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
                }
                await setActiveProvider(providerId as ProviderId, modelId || '');
                return NextResponse.json({ ok: true });
            }
            case 'setThinking': {
                const { providerId, mode } = body;
                if (!providerId || !mode) {
                    return NextResponse.json({ error: 'providerId and mode are required' }, { status: 400 });
                }
                await setThinkingModeDb(providerId as ProviderId, mode);
                return NextResponse.json({ ok: true });
            }
            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (err: any) {
        console.error('POST /api/ai/config error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * GET /api/ai/config/resolve
 * Returns the actual (decrypted) active config for use in the chat route.
 * Only called server-side from the API route.
 */
export async function HEAD() {
    // Used as health check
    return new NextResponse(null, { status: 200 });
}
