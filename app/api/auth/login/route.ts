import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServerClient as createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { success: false, message: 'Email dan password wajib diisi' },
                { status: 400 }
            );
        }

        const redirectTo = request.nextUrl.searchParams.get('redirect') || '/dashboard';

        // Create response early — cookies set during signIn must be captured on it
        const response = NextResponse.json({ success: true, redirectTo });

        // SSR client with cookie handling — signs in user and sets session cookies
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options);
                        });
                    },
                },
            },
        );

        // Sign in with email and password
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error || !data.session) {
            console.error('[LOGIN API] Supabase auth error:', error?.message);
            return NextResponse.json(
                { success: false, message: 'Email atau password salah' },
                { status: 401 }
            );
        }

        // Verify role using service role client (bypasses RLS)
        const adminSupabase = createServiceClient();
        const { data: roleData } = await adminSupabase
            .from('user_roles')
            .select('role')
            .eq('user_id', data.session.user.id)
            .limit(1)
            .single();

        const role = roleData?.role;
        if (role !== 'super_admin') {
            // Sign out immediately — not authorized
            await supabase.auth.signOut();
            return NextResponse.json(
                { success: false, message: 'Akses ditolak. Hanya super admin yang dapat login.' },
                { status: 403 }
            );
        }

        // Success — return response with session cookies already attached
        response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        return response;
    } catch (err) {
        console.error('[LOGIN API] Unexpected error:', err);
        return NextResponse.json(
            { success: false, message: 'Terjadi kesalahan server' },
            { status: 500 }
        );
    }
}
