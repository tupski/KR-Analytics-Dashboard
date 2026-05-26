/**
 * Auth-aware Supabase client — uses anon key + cookie-based session.
 * Used in middleware and server components that need the current user's session.
 * Do NOT use this for admin DB queries — use createServerClient() instead.
 */

import { createServerClient as createSSRClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createAuthClient() {
    const cookieStore = await cookies();

    return createSSRClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // Server component — can't set cookies, that's fine
                    }
                },
            },
        },
    );
}

/**
 * Get the current session and user from Supabase Auth.
 * Returns null if not authenticated.
 */
export async function getSession() {
    const supabase = await createAuthClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

/**
 * Get the current user's role from user_roles table.
 * Returns null if not authenticated or no role found.
 */
export async function getUserRole(userId: string): Promise<string | null> {
    // Use service role client to bypass RLS for role lookup
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = createServerClient();

    const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .limit(1)
        .single();

    return data?.role ?? null;
}

/**
 * Check if the current session user is super_admin.
 */
export async function isSuperAdmin(): Promise<boolean> {
    const session = await getSession();
    if (!session?.user) return false;
    const role = await getUserRole(session.user.id);
    return role === 'super_admin';
}
