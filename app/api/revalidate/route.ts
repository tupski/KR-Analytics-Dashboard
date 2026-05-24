import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { CACHE_TAGS } from '@/lib/cache';

/**
 * API Route for Cache Revalidation
 * 
 * Allows manual cache invalidation for dashboard data.
 * Can be called to force refresh of cached data.
 * 
 * Usage:
 * POST /api/revalidate
 * Body: { tag: 'kpi-data' } or { tag: 'all' }
 * 
 * Requirements: 11.1, 11.4
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { tag, secret } = body;

        // Verify secret token (optional, for security)
        if (secret && secret !== process.env.REVALIDATION_SECRET) {
            return NextResponse.json(
                { error: 'Invalid secret' },
                { status: 401 }
            );
        }

        // Revalidate specific tag or all dashboard data
        if (tag === 'all') {
            revalidateTag(CACHE_TAGS.ALL_DASHBOARD);
            Object.values(CACHE_TAGS).forEach((t) => revalidateTag(t));
        } else if (tag && Object.values(CACHE_TAGS).includes(tag)) {
            revalidateTag(tag);
        } else {
            return NextResponse.json(
                { error: 'Invalid tag' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            revalidated: true,
            tag,
            now: Date.now(),
        });
    } catch (error) {
        console.error('Revalidation error:', error);
        return NextResponse.json(
            { error: 'Failed to revalidate' },
            { status: 500 }
        );
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
