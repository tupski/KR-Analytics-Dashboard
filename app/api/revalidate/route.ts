import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-response';

/**
 * API Route for Cache Revalidation
 *
 * Allows manual cache invalidation for dashboard data.
 * Can be called to force refresh of cached data.
 *
 * Usage:
 * POST /api/revalidate
 * Body: { tag: 'analytics-cache' } or { tag: 'all' }
 *
 */

// Known cache tags for analytics system
const CACHE_TAGS = {
    ANALYTICS_QUERY: 'analytics_query_cache',
    ANALYTICS_MART: 'analytics_cache_mart',
    APP_SETTINGS: 'app_settings',
    AI_INSIGHT: 'ai_insight',
    ALL: 'all',
} as const;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { tag, secret } = body;

        // Verify secret token (optional, for security)
        if (secret && secret !== process.env.REVALIDATION_SECRET) {
            return apiErrorResponse(401, 'Unauthorized', 'Invalid secret token');
        }

        // Revalidate specific tag or all caches
        if (tag === 'all') {
            Object.values(CACHE_TAGS).forEach((t) => revalidateTag(t));
        } else if (tag && Object.values(CACHE_TAGS).includes(tag as any)) {
            revalidateTag(tag);
        } else {
            return apiErrorResponse(400, 'Bad Request', `Invalid tag. Available: ${Object.keys(CACHE_TAGS).join(', ')}`);
        }

        return NextResponse.json({
            success: true,
            revalidated: true,
            tag,
            now: Date.now(),
        });
    } catch (error) {
        console.error('[revalidate] Error:', error);
        return apiErrorResponse(500, 'Internal Server Error', 'Failed to revalidate cache');
    }
}

/**
 * GET endpoint to check available tags
 */
export async function GET() {
    return NextResponse.json({
        availableTags: Object.entries(CACHE_TAGS).map(([key, value]) => ({
            key,
            value,
        })),
        usage: 'POST /api/revalidate with { tag: "tag-name" } or { tag: "all" }',
    });
}
