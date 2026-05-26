'use server';

import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth';

export async function signOut() {
    const supabase = await createAuthClient();
    await supabase.auth.signOut();
    redirect('/login');
}
