/**
 * Per-route auth guards — defense-in-depth on top of middleware.ts.
 *
 * Middleware protects route paths, but a route added outside the matcher or a
 * misconfiguration would silently expose it. These guards re-validate the
 * session server-side inside each handler:
 *   - requireUser()  → 401 when unauthenticated
 *   - requireAdmin() → 401 when unauthenticated, 403 when authenticated but
 *                      not super_admin
 *
 * Session validation uses the anon-key SSR client (getUser against the Supabase
 * Auth server); role lookup uses the service-role client (lib/supabase/server.ts)
 * to bypass RLS, mirroring middleware behavior.
 */

import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSession, getUserRole } from '@/lib/supabase/auth';
import { unauthorized, forbidden } from '@/lib/api-response';

/** Result of a guard: the validated user, or a NextResponse to return early. */
export type GuardResult = { user: User } | NextResponse;

/**
 * Returns the validated user or a 401 response.
 */
export async function requireUser(): Promise<GuardResult> {
    const session = await getSession();
    if (!session?.user) {
        return unauthorized('Authentication required');
    }
    return { user: session.user };
}

/**
 * Returns the validated super_admin user or a 401/403 response.
 */
export async function requireAdmin(): Promise<GuardResult> {
    const session = await getSession();
    if (!session?.user) {
        return unauthorized('Authentication required');
    }

    const role = await getUserRole(session.user.id);
    if (role !== 'super_admin') {
        return forbidden('Access denied. Admin role required.');
    }

    return { user: session.user };
}

/**
 * Type guard: is the guard result an error response (instead of a user)?
 *
 * Usage:
 *   const guard = await requireAdmin();
 *   if (isGuardError(guard)) return guard;
 */
export function isGuardError(result: GuardResult): result is NextResponse {
    return result instanceof NextResponse;
}
