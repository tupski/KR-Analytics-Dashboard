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

    if (!enc || !ivB64) {
        throw new Error('Missing encrypted data or IV');
    }

    const iv = Buffer.from(ivB64, 'base64');

    // Detect legacy format (saved by ai-actions.ts):
    //   api_key_enc = "base64Ciphertext.base64AuthTag"  (dot-separated)
    // vs new format (saved by configServer.ts):
    //   api_key_enc = base64(authTag[16] + ciphertext)   (binary prepended)
    if (enc.includes('.')) {
        // Legacy format: "${encrypted}.${authTag}" from ai-actions.ts
        const [cipherB64, authTagB64] = enc.split('.');
        if (!cipherB64 || !authTagB64) {
            throw new Error('Invalid legacy format: missing cipher or auth tag');
        }
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(cipherB64, 'base64')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    }

    // New format: authTag (16 bytes) prepended to ciphertext
    const combined = Buffer.from(enc, 'base64');
    if (combined.length < 16) {
        throw new Error('Invalid encrypted data: too short');
    }
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

// ── L3 egress cache ──────────────────────────────────────────────────────────
// Config rows include ENCRYPTED api keys — never logged, never persisted to any
// durable cache. In-memory module cache only, 60s TTL. Writes invalidate it so
// a config save is visible on the next read.
const CONFIG_CACHE_TTL_MS = 60_000;
let configCache: { expiresAt: number; value: DbProviderConfig[] } | null = null;

function invalidateConfigCache(): void {
    configCache = null;
}

/** Raw rows → decrypted DbProviderConfig[], cached in-memory 60s. */
async function fetchCachedConfigs(): Promise<DbProviderConfig[]> {
    const now = Date.now();
    if (configCache && configCache.expiresAt > now) {
        return configCache.value;
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('ai_provider_configs')
        .select('provider_id, api_key_enc, api_key_iv, model, base_url, is_active, active_model, thinking_mode')
        .eq('scope', SCOPE);

    if (error || !data) return [];

    const configs = data.map((row: any) => {
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

    configCache = { expiresAt: now + CONFIG_CACHE_TTL_MS, value: configs };
    return configs;
}

export async function loadAllProviderConfigs(): Promise<DbProviderConfig[]> {
    return fetchCachedConfigs();
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
    invalidateConfigCache();
}

export async function deleteProviderConfig(providerId: ProviderId): Promise<void> {
    const supabase = createServerClient();
    const { error } = await supabase
        .from('ai_provider_configs')
        .delete()
        .eq('scope', SCOPE)
        .eq('provider_id', providerId);

    if (error) throw new Error(`Failed to delete AI config: ${error.message}`);
    invalidateConfigCache();
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
    invalidateConfigCache();
}

export async function setThinkingModeDb(providerId: ProviderId, mode: string): Promise<void> {
    const supabase = createServerClient();
    await supabase
        .from('ai_provider_configs')
        .update({ thinking_mode: mode })
        .eq('scope', SCOPE)
        .eq('provider_id', providerId);
    invalidateConfigCache();
}

// ── API Key Preview & Validation Helpers (PART 2, 6, 7) ──────────────────────

/**
 * Generate a masked preview of an API key for safe display in the browser.
 * Server-side only — frontend MUST never compute previews from full keys.
 *
 * Rules:
 * - key <= 12 chars: first 4 + "***" + last 4
 * - key > 12 chars:  first 8 + "***" + last 4
 *
 * Example: "sk-aKdsu2h88k1234" → "sk-aKdsu***1234"
 */
export function maskApiKeyForPreview(apiKey: string): string | null {
    if (!apiKey) return null;

    if (apiKey.length <= 12) {
        return apiKey.slice(0, 4) + '***' + apiKey.slice(-4);
    }

    return apiKey.slice(0, 8) + '***' + apiKey.slice(-4);
}

/**
 * Detect if a value looks like a masked/obfuscated key (user pasted preview).
 * Reject values containing ***, ••, or ...
 */
export function isMaskedApiKey(value: string): boolean {
    return (
        value.includes('***') ||
        value.includes('••') ||
        value.includes('...')
    );
}

// ── Safe client-facing config (PART 3) ───────────────────────────────────────

/** Safe config shape sent to the browser — NEVER includes full decrypted API key. */
export interface SafeProviderConfig {
    providerId: ProviderId;
    apiKeySet: boolean;
    apiKeyPreview: string | null;
    baseUrl: string;
    model: string;
    isActive: boolean;
    activeModel?: string;
    thinkingMode: string;
}

/**
 * Load provider configs for client consumption.
 * Returns apiKeySet + apiKeyPreview + isActive + activeModel + thinkingMode — never the full decrypted key.
 */
export async function loadConfigForClient(): Promise<SafeProviderConfig[]> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('ai_provider_configs')
        .select('provider_id, api_key_enc, api_key_iv, model, base_url, is_active, active_model, thinking_mode')
        .eq('scope', SCOPE);

    if (error || !data) return [];

    return data.map((row: any) => {
        let decrypted = '';
        try {
            decrypted = decryptApiKey(row.api_key_enc, row.api_key_iv);
        } catch {
            // Decryption failure — key will appear as not set
        }
        return {
            providerId: row.provider_id as ProviderId,
            apiKeySet: !!decrypted,
            apiKeyPreview: maskApiKeyForPreview(decrypted),
            baseUrl: row.base_url || '',
            model: row.model || '',
            isActive: row.is_active,
            activeModel: row.active_model || undefined,
            thinkingMode: row.thinking_mode || 'auto',
        };
    });
}

// ── Default Base URLs for providers that need them ───────────────────────────
const DEFAULT_BASE_URLS: Record<string, string> = {
    'openrouter': 'https://openrouter.ai/api/v1',
    'groq': 'https://api.groq.com/openai/v1',
    'deepseek': 'https://api.deepseek.com/v1',
    'kiro': 'https://api.kiro.ai/v1',
};

// ── Upsert with empty-key protection (PART 5) ────────────────────────────────

/**
 * Upsert provider config. If apiKey is empty/falsy, keep the existing
 * encrypted key unchanged (only update model/baseUrl/isActive/active_model).
 */
export async function upsertProviderConfigSafe(conf: {
    providerId: ProviderId;
    apiKey: string;
    model: string;
    baseUrl?: string;
    isActive?: boolean;
}): Promise<void> {
    const supabase = createServerClient();

    // Reject masked keys
    if (conf.apiKey && isMaskedApiKey(conf.apiKey)) {
        throw new Error('API key tidak valid — terdeteksi karakter masking (***, ••, ...). Masukkan key asli.');
    }

    // Set default base URL if not provided and provider needs it
    const baseUrl = conf.baseUrl || DEFAULT_BASE_URLS[conf.providerId] || null;

    const hasNewKey = conf.apiKey && conf.apiKey.trim();

    // Always sync active_model with model when model field changes
    const updateFields: Record<string, any> = {
        model: conf.model,
        active_model: conf.model,
        base_url: baseUrl,
        is_active: conf.isActive ?? false,
    };

    if (hasNewKey) {
        // Full upsert with new encrypted key
        const { enc, iv } = encryptApiKey(conf.apiKey.trim());
        const { error } = await supabase
            .from('ai_provider_configs')
            .upsert({
                scope: SCOPE,
                provider_id: conf.providerId,
                api_key_enc: enc,
                api_key_iv: iv,
                ...updateFields,
            }, { onConflict: 'scope,provider_id' });

        if (error) throw new Error(`Failed to save AI config: ${error.message}`);
        invalidateConfigCache();
    } else {
        // No new key — update only non-key fields if row exists
        const { data: existing } = await supabase
            .from('ai_provider_configs')
            .select('id')
            .eq('scope', SCOPE)
            .eq('provider_id', conf.providerId)
            .single();

        if (!existing) {
            throw new Error('API key wajib diisi untuk konfigurasi baru.');
        }

        const { error } = await supabase
            .from('ai_provider_configs')
            .update(updateFields)
            .eq('scope', SCOPE)
            .eq('provider_id', conf.providerId);

        if (error) throw new Error(`Failed to save AI config: ${error.message}`);
        invalidateConfigCache();
    }
}
