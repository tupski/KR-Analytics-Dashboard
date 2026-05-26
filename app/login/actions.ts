'use server';

import { createAuthClient } from '@/lib/supabase/auth';

export async function loginAction(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
        return { error: 'Email dan password harus diisi.' };
    }

    const supabase = await createAuthClient();

    // Sign in with email and password
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (signInError) {
        return { error: signInError.message };
    }

    if (!data.session) {
        return { error: 'Login gagal. Silakan coba lagi.' };
    }

    // Check role using service role client
    const { createServerClient } = await import('@/lib/supabase/server');
    const adminSupabase = createServerClient();

    const { data: roleData } = await adminSupabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.session.user.id)
        .limit(1)
        .single();

    if (roleData?.role !== 'super_admin') {
        await supabase.auth.signOut();
        return { error: 'Akses ditolak. Hanya super admin yang dapat login.' };
    }

    // Success - return success flag
    return { success: true };
}
