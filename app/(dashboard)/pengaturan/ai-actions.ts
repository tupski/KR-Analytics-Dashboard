'use server';

import { createServerClient } from '@/lib/supabase/server';
import { encryptApiKey, decryptApiKey } from '@/lib/ai/configServer';
import { AIConfigSchema, type AIConfigInput } from '@/lib/validation';
import { getSession, getUserRole } from '@/lib/supabase/auth';

export type { AIConfigInput as AIConfig };

// ─── Session Guard for Server Actions ────────────────────────────
async function requireAdminAction(): Promise<{ authError: string } | null> {
    const session = await getSession();
    if (!session?.user) return { authError: 'Autentikasi diperlukan.' };
    const role = await getUserRole(session.user.id);
    if (role !== 'super_admin') return { authError: 'Akses ditolak. Hanya super admin.' };
    return null;
}

export async function saveAIConfig(config: unknown) {
    const authCheck = await requireAdminAction();
    if (authCheck) return authCheck;

    // Validate input using Zod schema (imported from lib/validation.ts)
    const result = AIConfigSchema.safeParse(config);
    if (!result.success) {
        const error = result.error.issues[0]?.message || 'Input tidak valid';
        console.error('[saveAIConfig] Validation error:', error);
        return { error };
    }

    try {
        const supabase = createServerClient();
        const validatedConfig = result.data;

        // FIX 8: Use canonical encryptApiKey from configServer.ts (returns { enc, iv })
        // The returned `enc` has authTag prepended to ciphertext (new canonical format)
        const { enc, iv } = encryptApiKey(validatedConfig.apiKey);

        // Upsert config
        const { error } = await supabase
            .from('ai_provider_configs')
            .upsert({
                scope: 'global',
                provider_id: validatedConfig.provider,
                api_key_enc: enc,
                api_key_iv: iv,
                model: validatedConfig.model,
                base_url: validatedConfig.baseUrl || null,
                is_active: true,
                active_model: validatedConfig.model,
                thinking_mode: validatedConfig.thinkingMode || 'auto',
            }, {
                onConflict: 'scope,provider_id',
            });

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('[saveAIConfig] Error:', error);
        return { error: error.message || 'Gagal menyimpan konfigurasi AI' };
    }
}

export async function loadAIConfig(): Promise<AIConfigInput | null> {
    try {
        const supabase = createServerClient();

        // Get active config
        const { data, error } = await supabase
            .from('ai_provider_configs')
            .select('*')
            .eq('scope', 'global')
            .eq('is_active', true)
            .limit(1)
            .single();

        if (error || !data) return null;

        // FIX 8: Use canonical decryptApiKey from configServer.ts
        // Handles both legacy (dot-separated) and new (authTag prepended) formats
        const apiKey = decryptApiKey(data.api_key_enc, data.api_key_iv);

        return {
            provider: data.provider_id,
            apiKey,
            model: data.active_model || data.model,
            baseUrl: data.base_url || undefined,
            thinkingMode: data.thinking_mode as any,
        };
    } catch (error: any) {
        console.error('[loadAIConfig] Error:', error);
        return null;
    }
}

/**
 * Save a custom model to ai_provider_models table with is_custom=true.
 * Called when user tests a custom model name and it works.
 */
export async function saveCustomModel(
    providerSlug: string,
    providerName: string,
    modelId: string,
    displayName: string,
): Promise<{ success: boolean; error?: string; authError?: string }> {
    const authCheck = await requireAdminAction();
    if (authCheck) return { success: false, ...authCheck };

    try {
        const supabase = createServerClient();

        const { error } = await supabase
            .from('ai_provider_models')
            .upsert({
                provider_slug: providerSlug,
                provider_name: providerName,
                model_id: modelId,
                display_name: displayName,
                enabled: true,
                is_custom: true,
                is_active: true,
                capabilities: {
                    vision: false,
                    reasoning: false,
                    functionCalling: true,
                },
            }, {
                onConflict: 'provider_slug,model_id',
                ignoreDuplicates: false,
            });

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('[saveCustomModel] Error:', error);
        return { success: false, error: error.message || 'Gagal menyimpan model custom' };
    }
}

export async function deleteAIConfig(provider: string): Promise<{ success?: boolean; error?: string; authError?: string }> {
    const authCheck = await requireAdminAction();
    if (authCheck) return authCheck;

    try {
        const supabase = createServerClient();

        const { error } = await supabase
            .from('ai_provider_configs')
            .delete()
            .eq('scope', 'global')
            .eq('provider_id', provider);

        if (error) throw error;

        return { success: true };
    } catch (error: any) {
        console.error('[deleteAIConfig] Error:', error);
        return { error: error.message || 'Gagal menghapus konfigurasi AI' };
    }
}
