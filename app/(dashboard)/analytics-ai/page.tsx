/**
 * 🗑️ SAFE TO REMOVE — Verified unused as of 2026-05-27 audit.
 * This file is dead code. No imports reference it.
 * Awaiting approval before deletion.
 *
 * Note: This is a redirect route. It redirects to `/chat`.
 * Safe to remove if the `/analytics-ai` URL is no longer needed.
 */

import { redirect } from 'next/navigation';

export default function AnalyticsAIPage() {
    redirect('/chat');
}
