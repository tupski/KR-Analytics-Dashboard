'use server';

import { createServerClient } from '@/lib/supabase/server';
// FIX 8: Delegate encrypt/decrypt to canonical configServer.ts
import { encryptApiKey, decryptApiKey } from '@/lib/ai/configServer';

interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
    thinkingMode?: 'auto' | 'instant' | 'thinking';
}

export async function saveAIConfig(config: AIConfig) {
    try {
        const supabase = createServerClient();

        // FIX 8: Use canonical encryptApiKey from configServer.ts (returns { enc, iv })
        // The returned `enc` has authTag prepended to ciphertext (new canonical format)
        const { enc, iv } = encryptApiKey(config.apiKey);

        // Upsert config
        const { error } = await supabase
            .from('ai_provider_configs')
            .upsert({
                scope: 'global',
                provider_id: config.provider,
                api_key_enc: enc,
                api_key_iv: iv,
                model: config.model,
                base_url: config.baseUrl || null,
                is_active: true,
                active_model: config.model,
                thinking_mode: config.thinkingMode || 'auto',
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

export async function loadAIConfig(): Promise<AIConfig | null> {
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

export async function deleteAIConfig(provider: string) {
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
