import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware untuk auth protection.
 * - Redirect ke /login jika belum auth
 * - Check role super_admin untuk akses dashboard
 * - Allow public access ke /login
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public access to login page
    if (pathname === '/login') {
        return NextResponse.next();
    }

    // Create response object
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    // Create Supabase client with cookie handling
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
                        request.cookies.set(name, value);
                        response.cookies.set(name, value, options);
                    });
                },
            },
        },
    );

    // Get session
    const { data: { session } } = await supabase.auth.getSession();

    // Not authenticated → redirect to login
    if (!session) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Check role for protected routes
    // Use service role client to bypass RLS
    const adminSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll() {
                    // No-op for service role client
                },
            },
        },
    );

    const { data: roleData } = await adminSupabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();

    const role = roleData?.role;

    // Not super_admin → logout and redirect to login with error
    if (role !== 'super_admin') {
        await supabase.auth.signOut();
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'unauthorized');
        return NextResponse.redirect(loginUrl);
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files (public folder)
         * - /login (login page)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
