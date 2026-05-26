/**
 * Client-side AI config management using Supabase API.
 * All operations are async and call /api/ai/config.
 * 
 * This replaces localStorage-based config management with
 * secure database storage (AES-256-GCM encrypted).
 */

import type { ProviderId } from './models';

export interface ProviderConfig {
    providerId: ProviderId;
    apiKey: string; // Masked on client (sk-••••••••1234)
    apiKeySet: boolean;
    model: string;
    baseUrl?: string;
    isActive: boolean;
    activeModel?: string;
    thinkingMode: string;
}

export interface MultiAIConfig {
    activeProvider: ProviderId | 'auto';
    activeModel: string;
    providers: ProviderConfig[];
    thinkingMode: 'auto' | 'instant' | 'thinking';
}

/**
 * Load all provider configs from database
 */
export async function loadConfigFromDb(): Promise<MultiAIConfig> {
    try {
        const res = await fetch('/api/ai/config');
        if (!res.ok) throw new Error('Failed to load config');
        const data = await res.json();
        
        const configs: ProviderConfig[] = data.configs || [];
        const active = configs.find(c => c.isActive);
        
        return {
            activeProvider: active?.providerId || 'auto',
            activeModel: active?.activeModel || 'auto',
            providers: configs,
            thinkingMode: (active?.thinkingMode as any) || 'auto',
        };
    } catch (error) {
        return {
            activeProvider: 'auto',
            activeModel: 'auto',
            providers: [],
            thinkingMode: 'auto',
        };
    }
}

/**
 * Save provider config to database
 */
export async function saveProviderConfigToDb(
    providerId: ProviderId,
    apiKey: string,
    model: string,
    baseUrl?: string,
    isActive?: boolean
): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'upsert',
            providerId,
            apiKey,
            model,
            baseUrl,
            isActive,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save config');
    }
}

/**
 * Delete provider config from database
 */
export async function deleteProviderConfigFromDb(providerId: ProviderId): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'delete',
            providerId,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete config');
    }
}

/**
 * Set active provider
 */
export async function setActiveProviderInDb(
    providerId: ProviderId,
    modelId: string
): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'setActive',
            providerId,
            modelId,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to set active provider');
    }
}

/**
 * Set thinking mode
 */
export async function setThinkingModeInDb(
    providerId: ProviderId,
    mode: 'auto' | 'instant' | 'thinking'
): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'setThinking',
            providerId,
            mode,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to set thinking mode');
    }
}

/**
 * Check if any provider is configured
 */
export async function hasConfiguredProviders(): Promise<boolean> {
    const config = await loadConfigFromDb();
    return config.providers.length > 0;
}

/**
 * Migrate localStorage config to database (one-time operation)
 */
export async function migrateLocalStorageToDb(): Promise<{ migrated: number; errors: string[] }> {
    const STORAGE_KEY = 'kr-ai-config';
    const MIGRATION_FLAG = 'kr-ai-migrated-to-db';
    
    // Check if already migrated
    if (typeof window === 'undefined') {
        return { migrated: 0, errors: [] };
    }
    
    try {
        if (localStorage.getItem(MIGRATION_FLAG)) {
            return { migrated: 0, errors: [] };
        }
        
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            localStorage.setItem(MIGRATION_FLAG, 'true');
            return { migrated: 0, errors: [] };
        }
        
        const config = JSON.parse(raw);
        const providers = config.providers || {};
        const errors: string[] = [];
        let migrated = 0;
        
        // Migrate each provider
        for (const [providerId, conf] of Object.entries(providers)) {
            try {
                await saveProviderConfigToDb(
                    providerId as ProviderId,
                    (conf as any).apiKey,
                    (conf as any).model,
                    (conf as any).baseUrl,
                    config.activeProvider === providerId
                );
                migrated++;
            } catch (err: any) {
                errors.push(`${providerId}: ${err.message}`);
            }
        }
        
        // Mark as migrated
        localStorage.setItem(MIGRATION_FLAG, 'true');
        
        // Optionally clear old localStorage data after successful migration
        if (migrated > 0 && errors.length === 0) {
            localStorage.removeItem(STORAGE_KEY);
        }
        
        return { migrated, errors };
    } catch (error: any) {
        return { migrated: 0, errors: [error.message] };
    }
}

/**
 * Get list of configured provider IDs
 */
export async function getConfiguredProviderIds(): Promise<ProviderId[]> {
    const config = await loadConfigFromDb();
    return config.providers.map(p => p.providerId);
}
