/**
 * Multi-provider AI config management.
 * Allows storing API keys for multiple providers simultaneously.
 *
 * Storage shape (kr-ai-config):
 * {
 *   activeProvider: 'deepseek',
 *   activeModel: 'deepseek-chat',
 *   providers: {
 *     deepseek: { apiKey, model, baseUrl? },
 *     gemini:   { apiKey, model, baseUrl? },
 *     ...
 *   },
 *   thinkingMode: 'auto' | 'instant' | 'thinking'
 * }
 */

import { PROVIDERS, type ProviderId, getProvider } from './models';

const STORAGE_KEY = 'kr-ai-config';
const LEGACY_KEY = STORAGE_KEY; // same — we migrate inline

export type ThinkingMode = 'auto' | 'instant' | 'thinking';

export interface ProviderConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
}

export interface MultiAIConfig {
    activeProvider: ProviderId | 'auto';
    activeModel: string; // model id of active provider, or 'auto'
    providers: Partial<Record<ProviderId, ProviderConfig>>;
    thinkingMode: ThinkingMode;
}

const DEFAULT_CONFIG: MultiAIConfig = {
    activeProvider: 'auto',
    activeModel: 'auto',
    providers: {},
    thinkingMode: 'auto',
};

/** Migrate legacy single-provider config shape to new multi-provider shape */
function migrateLegacy(raw: any): MultiAIConfig {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };

    // Already in new format
    if (raw.providers && typeof raw.providers === 'object') {
        return {
            activeProvider: raw.activeProvider || 'auto',
            activeModel: raw.activeModel || 'auto',
            providers: raw.providers,
            thinkingMode: raw.thinkingMode || 'auto',
        };
    }

    // Legacy format: { provider, apiKey, model, baseUrl }
    if (raw.provider && raw.apiKey) {
        const providerId = raw.provider === 'custom' ? 'openai-compatible' : raw.provider;
        return {
            activeProvider: providerId,
            activeModel: raw.model || 'auto',
            providers: {
                [providerId]: {
                    apiKey: raw.apiKey,
                    model: raw.model || '',
                    baseUrl: raw.baseUrl,
                },
            },
            thinkingMode: 'auto',
        };
    }

    return { ...DEFAULT_CONFIG };
}

export function loadConfig(): MultiAIConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_CONFIG };
        return migrateLegacy(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

export function saveConfig(cfg: MultiAIConfig) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        window.dispatchEvent(new Event('kr-ai-config-changed'));
    } catch { }
}

export function setProviderConfig(providerId: ProviderId, conf: ProviderConfig) {
    const cfg = loadConfig();
    cfg.providers = { ...cfg.providers, [providerId]: conf };
    saveConfig(cfg);
}

export function removeProvider(providerId: ProviderId) {
    const cfg = loadConfig();
    if (cfg.providers[providerId]) {
        const newProviders = { ...cfg.providers };
        delete newProviders[providerId];
        cfg.providers = newProviders;
        if (cfg.activeProvider === providerId) {
            cfg.activeProvider = 'auto';
            cfg.activeModel = 'auto';
        }
        saveConfig(cfg);
    }
}

export function setActive(providerId: ProviderId | 'auto', modelId: string) {
    const cfg = loadConfig();
    cfg.activeProvider = providerId;
    cfg.activeModel = modelId;
    saveConfig(cfg);
}

export function setThinkingMode(mode: ThinkingMode) {
    const cfg = loadConfig();
    cfg.thinkingMode = mode;
    saveConfig(cfg);
}

/** List of providers that have an API key configured */
export function configuredProviders(): ProviderId[] {
    const cfg = loadConfig();
    return Object.entries(cfg.providers)
        .filter(([_, c]) => c?.apiKey)
        .map(([k]) => k as ProviderId);
}

/**
 * Resolve which (provider, model) to use for a given request.
 *
 * - If activeProvider is a real provider, use that.
 * - If activeProvider is 'auto' or activeModel is 'auto', pick the cheapest configured
 *   provider+model that matches the requested capability (e.g., reasoning for 'thinking' mode).
 */
export function resolveActive(
    thinkingMode: ThinkingMode = 'auto',
    needVision: boolean = false,
): { providerId: ProviderId; conf: ProviderConfig; modelId: string } | null {
    const cfg = loadConfig();
    const configured = configuredProviders();
    if (configured.length === 0) return null;

    // Explicit provider+model selection
    if (cfg.activeProvider !== 'auto' && cfg.activeModel !== 'auto') {
        const conf = cfg.providers[cfg.activeProvider as ProviderId];
        if (conf?.apiKey) {
            return {
                providerId: cfg.activeProvider as ProviderId,
                conf,
                modelId: cfg.activeModel,
            };
        }
    }

    // Auto mode: pick best matching model from configured providers
    const candidates = configured.flatMap(pid => {
        const provider = getProvider(pid);
        if (!provider) return [];
        return provider.models.map(m => ({
            providerId: pid,
            modelId: m.id,
            model: m,
            conf: cfg.providers[pid]!,
        }));
    });

    // Filter by capability requirements
    let filtered = candidates;
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
    // For 'auto', prefer fast tools-capable models

    if (filtered.length === 0) {
        // Fallback to whatever first configured provider has
        const first = candidates[0];
        if (!first) return null;
        return { providerId: first.providerId, modelId: first.modelId, conf: first.conf };
    }

    // Pick cheapest among filtered
    filtered.sort((a, b) => a.model.inputPrice - b.model.inputPrice);
    const best = filtered[0];
    return { providerId: best.providerId, modelId: best.modelId, conf: best.conf };
}
