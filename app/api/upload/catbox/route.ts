import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/upload/catbox
 * Proxies file upload to Catbox.moe to avoid CORS issues in the browser.
 * Catbox does not return Access-Control-Allow-Origin, so uploads must go
 * through a same-origin server-side proxy.
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('fileToUpload') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
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