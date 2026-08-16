import { NextRequest, NextResponse } from 'next/server';
import {
    loadAllProviderConfigs,
    loadConfigForClient,
    upsertProviderConfigSafe,
    deleteProviderConfig,
    setActiveProvider,
    setThinkingModeDb,
} from '@/lib/ai/configServer';
import type { ProviderId } from '@/lib/ai/models';
import { requireAdmin, isGuardError } from '@/lib/security/guard';

/**
 * GET /api/ai/config
 * Returns safe config WITHOUT full decrypted API keys.
 * Only apiKeySet + apiKeyPreview — never the full key.
 */
export async function GET(request: NextRequest) {
    try {
        const guard = await requireAdmin();
        if (isGuardError(guard)) return guard;

        // If ?provider=X is passed, return configs for a specific provider
        // (used by resolveActiveFromDb — server-side only, but still safe)
        const providerFilter = request.nextUrl.searchParams.get('provider');

        const configs = await loadConfigForClient();

        if (providerFilter) {
            const filtered = configs.filter(c => c.providerId === providerFilter);
            return NextResponse.json({ configs: filtered });
        }

        return NextResponse.json({ configs });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * POST /api/ai/config
 * Body: { action: 'upsert' | 'delete' | 'setActive' | 'setThinking', ...payload }
 */
export async function POST(request: NextRequest) {
    try {
        const guard = await requireAdmin();
        if (isGuardError(guard)) return guard;

        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'upsert': {
                const { providerId, apiKey, model, baseUrl, isActive } = body;
                if (!providerId) {
                    return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
                }
                // apiKey can be empty to keep existing key (PART 5)
                // model is required for DB row
                if (!model) {
                    return NextResponse.json({ error: 'model is required' }, { status: 400 });
                }
                await upsertProviderConfigSafe({ providerId, apiKey: apiKey || '', model, baseUrl, isActive });
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
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * HEAD /api/ai/config — health check
 */
export async function HEAD() {
    return new NextResponse(null, { status: 200 });
}
