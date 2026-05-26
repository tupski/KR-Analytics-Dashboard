/**
 * Server-side AI config storage in Supabase.
 *
 * API keys are AES-256-GCM encrypted using AI_ENCRYPTION_KEY from .env
 * before being written to the database. The DB never stores plaintext.
 *
 * Usage: import in Server Actions or API Routes only.
 */

import { createServerClient } from '@/lib/supabase/server';
import type { ProviderId } from './models';

const ENCRYPTION_KEY_ENV = 'AI_ENCRYPTION_KEY';
const SCOPE = 'global';

// ── Crypto helpers (Node.js crypto module) ───────────────────────────────────

function getEncryptionKey(): Buffer {
    const key = process.env[ENCRYPTION_KEY_ENV];
    if (!key) {
        throw new Error(
            `${ENCRYPTION_KEY_ENV} environment variable is not set. ` +
            'Generate a 32-byte hex key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        );
    }
    // Accept 64-char hex (32 bytes) or base64
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
        return Buffer.from(key, 'hex');
    }
    const buf = Buffer.from(key, 'base64');
    if (buf.length !== 32) {
        throw new Error(`${ENCRYPTION_KEY_ENV} must be a 32-byte key (64 hex chars or 44 base64 chars).`);
    }
    return buf;
}

export function encryptApiKey(plaintext: string): { enc: string; iv: string } {
    const { createCipheriv, randomBytes } = require('crypto') as typeof import('crypto');
    const key = getEncryptionKey();
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Prepend 16-byte auth tag to ciphertext
    const combined = Buffer.concat([authTag, encrypted]);
    return {
        enc: combined.toString('base64'),
        iv: iv.toString('base64'),
    };
}

export function decryptApiKey(enc: string, ivB64: string): string {
    const { createDecipheriv } = require('crypto') as typeof import('crypto');
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const combined = Buffer.from(enc, 'base64');
    const authTag = combined.subarray(0, 16);
    const ciphertext = combined.subarray(16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
}

// ── Database helpers ─────────────────────────────────────────────────────────

export interface DbProviderConfig {
    providerId: ProviderId;
    apiKey: string;          // decrypted
    model: string;
    baseUrl?: string;
    isActive: boolean;
    activeModel?: string;
    thinkingMode: string;
}

export async function loadAllProviderConfigs(): Promise<DbProviderConfig[]> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('ai_provider_configs')
        .select('provider_id, api_key_enc, api_key_iv, model, base_url, is_active, active_model, thinking_mode')
        .eq('scope', SCOPE);

    if (error || !data) return [];

    return data.map((row: any) => {
        let apiKey = '';
        try {
            apiKey = decryptApiKey(row.api_key_enc, row.api_key_iv);
        } catch {
            // Decryption failure — skip silently (key mismatch or corrupt data)
        }
        return {
            providerId: row.provider_id as ProviderId,
            apiKey,
            model: row.model || '',
            baseUrl: row.base_url || undefined,
            isActive: row.is_active,
            activeModel: row.active_model || undefined,
            thinkingMode: row.thinking_mode || 'auto',
        };
    }).filter(c => c.apiKey); // Only return configs with successfully decrypted keys
}

export async function upsertProviderConfig(conf: {
    providerId: ProviderId;
    apiKey: string;
    model: string;
    baseUrl?: string;
    isActive?: boolean;
}): Promise<void> {
    const supabase = createServerClient();
    const { enc, iv } = encryptApiKey(conf.apiKey);

    const { error } = await supabase
        .from('ai_provider_configs')
        .upsert({
            scope: SCOPE,
            provider_id: conf.providerId,
            api_key_enc: enc,
            api_key_iv: iv,
            model: conf.model,
            base_url: conf.baseUrl || null,
            is_active: conf.isActive ?? false,
        }, { onConflict: 'scope,provider_id' });

    if (error) throw new Error(`Failed to save AI config: ${error.message}`);
}

export async function deleteProviderConfig(providerId: ProviderId): Promise<void> {
    const supabase = createServerClient();
    const { error } = await supabase
        .from('ai_provider_configs')
        .delete()
        .eq('scope', SCOPE)
        .eq('provider_id', providerId);

    if (error) throw new Error(`Failed to delete AI config: ${error.message}`);
}

export async function setActiveProvider(providerId: ProviderId, modelId: string): Promise<void> {
    const supabase = createServerClient();
    // Unset all active first
    await supabase
        .from('ai_provider_configs')
        .update({ is_active: false })
        .eq('scope', SCOPE);
    // Set the selected one as active
    await supabase
        .from('ai_provider_configs')
        .update({ is_active: true, active_model: modelId })
        .eq('scope', SCOPE)
        .eq('provider_id', providerId);
}

export async function setThinkingModeDb(providerId: ProviderId, mode: string): Promise<void> {
    const supabase = createServerClient();
    await supabase
        .from('ai_provider_configs')
        .update({ thinking_mode: mode })
        .eq('scope', SCOPE)
        .eq('provider_id', providerId);
}
