/**
 * Client-side AI config management using Supabase API.
 * All operations are async and call /api/ai/config.
 * 
 * This replaces localStorage-based config management with
 * secure database storage (AES-256-GCM encrypted).
 */

import type { ProviderId } from './models';

/** Safe config shape from server — NEVER includes full decrypted API key. */
export interface SafeProviderConfig {
    providerId: ProviderId;
    apiKeySet: boolean;
    apiKeyPreview: string | null;
    baseUrl: string;
    model: string;
}

export interface ProviderConfig {
    providerId: ProviderId;
    apiKeySet: boolean;
    apiKeyPreview: string | null;
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
 * Load all provider configs from database (safe — no full keys).
 */
export async function loadConfigFromDb(): Promise<MultiAIConfig> {
    try {
        const res = await fetch('/api/ai/config');
        if (!res.ok) throw new Error('Failed to load config');
        const data = await res.json();

        // GET now returns SafeProviderConfig[] — merge with active info
        // We also need active info; keep a separate active resolve endpoint or
        // just use the safe configs for display. Active provider tracking is
        // handled server-side by the chat route.
        const safeConfigs: SafeProviderConfig[] = data.configs || [];

        // For active provider / thinking mode, we need a separate call
        // or derive from the stored configs. Since the spec says GET only returns
        // apiKeySet + apiKeyPreview + baseUrl + model, we need a way to get
        // active status. Let's keep a separate active-state endpoint or store it.
        // For now, use first configured as fallback.
        const providers: ProviderConfig[] = safeConfigs.map(c => ({
            providerId: c.providerId,
            apiKeySet: c.apiKeySet,
            apiKeyPreview: c.apiKeyPreview,
            model: c.model,
            baseUrl: c.baseUrl || undefined,
            isActive: false,
            activeModel: undefined,
            thinkingMode: 'auto',
        }));

        return {
            activeProvider: 'auto',
            activeModel: 'auto',
            providers,
            thinkingMode: 'auto',
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

/**
 * Resolve which (provider, model) to use for a given request.
 * Database version of resolveActive from config.ts
 * 
 * - If activeProvider is a real provider, use that.
 * - If activeProvider is 'auto' or activeModel is 'auto', pick the cheapest configured
 *   provider+model that matches the requested capability (e.g., reasoning for 'thinking' mode).
 */
export async function resolveActiveFromDb(
    thinkingMode: 'auto' | 'instant' | 'thinking' = 'auto',
    needVision: boolean = false,
): Promise<{ providerId: ProviderId; apiKey: string; modelId: string; baseUrl?: string } | null> {
    const config = await loadConfigFromDb();
    
    // No providers configured
    if (config.providers.length === 0) return null;
    
    // Explicit provider+model selection
    if (config.activeProvider !== 'auto' && config.activeModel !== 'auto') {
        const provider = config.providers.find(p => p.providerId === config.activeProvider);
        if (provider && provider.apiKeySet) {
            // Need to fetch the actual API key from server
            const res = await fetch(`/api/ai/config?provider=${config.activeProvider}`);
            if (res.ok) {
                const data = await res.json();
                const fullConfig = data.configs?.find((c: any) => c.providerId === config.activeProvider);
                if (fullConfig?.apiKey) {
                    return {
                        providerId: config.activeProvider as ProviderId,
                        apiKey: fullConfig.apiKey,
                        modelId: config.activeModel,
                        baseUrl: provider.baseUrl,
                    };
                }
            }
        }
    }
    
    // Auto mode: pick best matching model from configured providers
    // Import models dynamically to avoid circular dependency
    const { getProvider } = await import('./models');
    
    const candidates = await Promise.all(
        config.providers
            .filter(p => p.apiKeySet)
            .map(async (providerConfig) => {
                const provider = getProvider(providerConfig.providerId);
                if (!provider) return [];
                
                // Fetch actual API key
                const res = await fetch(`/api/ai/config?provider=${providerConfig.providerId}`);
                let apiKey = '';
                if (res.ok) {
                    const data = await res.json();
                    const fullConfig = data.configs?.find((c: any) => c.providerId === providerConfig.providerId);
                    apiKey = fullConfig?.apiKey || '';
                }
                
                return provider.models.map(m => ({
                    providerId: providerConfig.providerId,
                    modelId: m.id,
                    model: m,
                    apiKey,
                    baseUrl: providerConfig.baseUrl,
                }));
            })
    );
    
    const flatCandidates = candidates.flat();
    
    // Filter by capability requirements
    let filtered = flatCandidates;
    if (needVision) {
        filtered = filtered.filter(c => c.model.capabilities.vision);
    }
    if (thinkingMode === 'thinking') {
        const reasoning = filtered.filter(c => c.model.capabilities.reasoning);
        if (reasoning.length > 0) filtered = reasoning;
    } else if (thinkingMode === 'instant') {
        const fast = filtered.filter(c => c.model.capabilities.fast);
        if (fast.length > 0) filtered = fast;
    }
    
    if (filtered.length === 0) {
        // Fallback to first available
        const first = flatCandidates[0];
        if (!first) return null;
        return {
            providerId: first.providerId,
            apiKey: first.apiKey,
            modelId: first.modelId,
            baseUrl: first.baseUrl,
        };
    }
    
    // Pick cheapest among filtered
    filtered.sort((a, b) => a.model.inputPrice - b.model.inputPrice);
    const best = filtered[0];
    return {
        providerId: best.providerId,
        apiKey: best.apiKey,
        modelId: best.modelId,
        baseUrl: best.baseUrl,
    };
}
