import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isGuardError } from '@/lib/security/guard';
import {
    rateLimit,
    userOrIpKey,
    getClientIp,
    rateLimitResponse,
} from '@/lib/security/rate-limit';

// Upload proxy abuse protection: 10 uploads per user per 10 minutes.
const UPLOAD_RATE_LIMIT = 10;
const UPLOAD_RATE_WINDOW_MS = 10 * 60 * 1000;

// Server-side MIME whitelist (mirrors CatboxUploadSchema in lib/validation.ts).
const ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
]);
// Server-side size cap (5 MB) — tighter than the client-side 20 MB schema.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/upload/catbox
 * Proxies file upload to Catbox.moe to avoid CORS issues in the browser.
 * Catbox does not return Access-Control-Allow-Origin, so uploads must go
 * through a same-origin server-side proxy.
 */
export async function POST(request: NextRequest) {
    try {
        // Session check + rate limiting (per audit P0-2 / P1-4).
        const guard = await requireUser();
        if (isGuardError(guard)) return guard;

        const clientIp = getClientIp(request);
        const uploadLimit = rateLimit({
            namespace: 'upload:catbox',
            limit: UPLOAD_RATE_LIMIT,
            windowMs: UPLOAD_RATE_WINDOW_MS,
            key: userOrIpKey(guard.user.id, clientIp),
        });
        if (!uploadLimit.allowed) {
            return rateLimitResponse(
                uploadLimit,
                'Terlalu banyak upload. Silakan coba lagi nanti.',
            );
        }

        const formData = await request.formData();
        const file = formData.get('fileToUpload') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Server-side file validation — never trust the client.
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: 'Tipe file tidak diizinkan. Hanya PNG, JPG, GIF, atau WebP.' },
                { status: 400 },
            );
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json(
                { error: 'Ukuran file melebihi batas 5 MB.' },
                { status: 400 },
            );
        }

        // Forward to Catbox
        const catboxForm = new FormData();
        catboxForm.append('reqtype', 'fileupload');
        catboxForm.append('fileToUpload', file, file.name);

        const response = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: catboxForm,
        });

        if (!response.ok) {
            throw new Error(`Catbox upload failed: ${response.statusText}`);
        }

        const url = await response.text();

        if (!url || !url.startsWith('https://files.catbox.moe/')) {
            throw new Error('Invalid response from Catbox');
        }

        return NextResponse.json({ url: url.trim() });
    } catch (error: any) {
        console.error('[Catbox proxy] Error:', error);
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }
}