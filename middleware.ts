import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Set anti-cache headers on a NextResponse.
 * Prevents Cloudflare / proxy / browser from caching HTML, RSC, or server action responses.
 */
function setNoCacheHeaders(response: NextResponse): void {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
}

/**
 * Shortcut: create a redirect with anti-cache headers.
 */
function redirectWithNoCache(url: URL): NextResponse {
    const response = NextResponse.redirect(url);
    setNoCacheHeaders(response);
    return response;
}

/**
 * Middleware untuk auth protection.
 * - Redirect ke /login jika belum auth
 * - Check role super_admin untuk akses dashboard
 * - Allow public access ke /login
 * - Set anti-cache headers on ALL responses
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public access to login page (handles /login?redirect=%2Fdashboard)
    if (pathname === '/login') {
        const response = NextResponse.next();
        setNoCacheHeaders(response);
        return response;
    }

    // Create response object
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });
    setNoCacheHeaders(response);

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

    // Get user (secure - authenticates with Supabase Auth server)
    const { data: { user }, error } = await supabase.auth.getUser();

    // Not authenticated → redirect to login
    if (error || !user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return redirectWithNoCache(loginUrl);
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
        .eq('user_id', user.id)
        .limit(1)
        .single();

    const role = roleData?.role;

    // Not super_admin → logout and redirect to login with error
    if (role !== 'super_admin') {
        await supabase.auth.signOut();
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', 'unauthorized');
        return redirectWithNoCache(loginUrl);
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
