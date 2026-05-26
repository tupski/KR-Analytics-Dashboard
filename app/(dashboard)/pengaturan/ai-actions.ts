'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.AI_ENCRYPTION_KEY || '', 'hex');
const ALGORITHM = 'aes-256-gcm';

interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
    thinkingMode?: 'auto' | 'instant' | 'thinking';
}

// Encrypt API key
function encryptApiKey(apiKey: string): { encrypted: string; iv: string; authTag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(apiKey, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag().toString('base64');

    return {
        encrypted,
        iv: iv.toString('base64'),
        authTag,
    };
}

// Decrypt API key
function decryptApiKey(encrypted: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv(
        ALGORITHM,
        ENCRYPTION_KEY,
        Buffer.from(iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

export async function saveAIConfig(config: AIConfig) {
    try {
        const supabase = createServerClient();

        // Encrypt API key
        const { encrypted, iv, authTag } = encryptApiKey(config.apiKey);

        // Combine encrypted + authTag for storage
        const apiKeyEnc = `${encrypted}.${authTag}`;

        // Upsert config
        const { error } = await supabase
            .from('ai_provider_configs')
            .upsert({
                scope: 'global',
                provider_id: config.provider,
                api_key_enc: apiKeyEnc,
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

        // Decrypt API key
        const [encrypted, authTag] = data.api_key_enc.split('.');
        const apiKey = decryptApiKey(encrypted, data.api_key_iv, authTag);

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
