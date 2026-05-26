/**
 * AI Model Registry
 *
 * Centralized catalog of AI providers and their models with capability metadata.
 * Used by:
 * - AISettingsPage for provider/model picker
 * - AIChatCore for inline model selection (showing only configured providers)
 * - API route for routing thinking modes to appropriate models
 */

export type ProviderId =
    | 'openai'
    | 'anthropic'
    | 'deepseek'
    | 'gemini'
    | 'groq'
    | 'openrouter'
    | 'kiro'
    | 'openai-compatible';

export interface ModelCapabilities {
    /** Can read images (vision) */
    vision: boolean;
    /** Has reasoning / chain-of-thought built-in */
    reasoning: boolean;
    /** Supports function/tool calling */
    tools: boolean;
    /** Optimized for speed (instant responses) */
    fast: boolean;
}

export interface ModelInfo {
    id: string;
    label: string;
    /** USD per 1M input tokens */
    inputPrice: number;
    /** USD per 1M output tokens */
    outputPrice: number;
    capabilities: ModelCapabilities;
    /** Notes shown in UI */
    notes?: string;
}

export interface ProviderInfo {
    id: ProviderId;
    name: string;
    description: string;
    placeholder: string;
    /** Whether this provider needs a custom base URL */
    hasBaseUrl: boolean;
    /** API key signup URL — shown to user */
    signupUrl?: string;
    models: ModelInfo[];
}

const cap = (over: Partial<ModelCapabilities> = {}): ModelCapabilities => ({
    vision: false,
    reasoning: false,
    tools: false,
    fast: false,
    ...over,
});

export const PROVIDERS: ProviderInfo[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        description: 'Murah, performa kuat untuk analitik',
        placeholder: 'sk-...',
        hasBaseUrl: false,
        signupUrl: 'https://platform.deepseek.com/api_keys',
        models: [
            { id: 'deepseek-chat', label: 'DeepSeek V3', inputPrice: 0.27, outputPrice: 1.10, capabilities: cap({ tools: true, fast: true }) },
            { id: 'deepseek-reasoner', label: 'DeepSeek R1', inputPrice: 0.55, outputPrice: 2.19, capabilities: cap({ reasoning: true, tools: true }), notes: 'Reasoning step-by-step' },
        ],
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Multimodal Google, kuat di vision & long context',
        placeholder: 'AIza...',
        hasBaseUrl: false,
        signupUrl: 'https://aistudio.google.com/apikey',
        models: [
            { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', inputPrice: 0.10, outputPrice: 0.40, capabilities: cap({ vision: true, tools: true, fast: true }) },
            { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', inputPrice: 0.075, outputPrice: 0.30, capabilities: cap({ vision: true, fast: true }) },
            { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', inputPrice: 0.075, outputPrice: 0.30, capabilities: cap({ vision: true, tools: true, fast: true }) },
            { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', inputPrice: 1.25, outputPrice: 5.00, capabilities: cap({ vision: true, tools: true, reasoning: true }) },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputPrice: 1.25, outputPrice: 10.00, capabilities: cap({ vision: true, tools: true, reasoning: true }), notes: 'Thinking model' },
        ],
    },
    {
        id: 'groq',
        name: 'Groq',
        description: 'Ultra-cepat (Llama, Mixtral, Whisper)',
        placeholder: 'gsk_...',
        hasBaseUrl: false,
        signupUrl: 'https://console.groq.com/keys',
        models: [
            { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', inputPrice: 0.05, outputPrice: 0.08, capabilities: cap({ tools: true, fast: true }) },
            { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', inputPrice: 0.59, outputPrice: 0.79, capabilities: cap({ tools: true, fast: true }) },
            { id: 'llama-3.2-11b-vision-preview', label: 'Llama 3.2 11B Vision', inputPrice: 0.18, outputPrice: 0.18, capabilities: cap({ vision: true, fast: true }) },
            { id: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision', inputPrice: 0.90, outputPrice: 0.90, capabilities: cap({ vision: true, fast: true }) },
            { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', inputPrice: 0.24, outputPrice: 0.24, capabilities: cap({ tools: true, fast: true }) },
            { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B', inputPrice: 0.75, outputPrice: 0.99, capabilities: cap({ reasoning: true, fast: true }) },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4o, o1, GPT-3.5',
        placeholder: 'sk-...',
        hasBaseUrl: false,
        signupUrl: 'https://platform.openai.com/api-keys',
        models: [
            { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPrice: 0.15, outputPrice: 0.60, capabilities: cap({ vision: true, tools: true, fast: true }) },
            { id: 'gpt-4o', label: 'GPT-4o', inputPrice: 2.50, outputPrice: 10.00, capabilities: cap({ vision: true, tools: true }) },
            { id: 'o1-mini', label: 'o1 mini', inputPrice: 1.10, outputPrice: 4.40, capabilities: cap({ reasoning: true }) },
            { id: 'o1', label: 'o1', inputPrice: 15.00, outputPrice: 60.00, capabilities: cap({ reasoning: true, vision: true }) },
            { id: 'o3-mini', label: 'o3 mini', inputPrice: 1.10, outputPrice: 4.40, capabilities: cap({ reasoning: true, tools: true, fast: true }) },
            { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', inputPrice: 10.00, outputPrice: 30.00, capabilities: cap({ vision: true, tools: true }) },
            { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', inputPrice: 0.50, outputPrice: 1.50, capabilities: cap({ tools: true, fast: true }) },
        ],
    },
    {
        id: 'anthropic',
        name: 'Anthropic Claude',
        description: 'Claude Haiku / Sonnet / Opus',
        placeholder: 'sk-ant-...',
        hasBaseUrl: false,
        signupUrl: 'https://console.anthropic.com/settings/keys',
        models: [
            { id: 'claude-haiku-4-20250514', label: 'Claude Haiku 4', inputPrice: 0.25, outputPrice: 1.25, capabilities: cap({ vision: true, tools: true, fast: true }) },
            { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', inputPrice: 0.80, outputPrice: 4.00, capabilities: cap({ vision: true, tools: true, fast: true }) },
            { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', inputPrice: 3.00, outputPrice: 15.00, capabilities: cap({ vision: true, tools: true }) },
            { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', inputPrice: 3.00, outputPrice: 15.00, capabilities: cap({ vision: true, tools: true, reasoning: true }) },
            { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', inputPrice: 15.00, outputPrice: 75.00, capabilities: cap({ vision: true, tools: true, reasoning: true }) },
        ],
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Akses 100+ model via 1 API key',
        placeholder: 'sk-or-...',
        hasBaseUrl: false,
        signupUrl: 'https://openrouter.ai/keys',
        models: [
            { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)', inputPrice: 0, outputPrice: 0, capabilities: cap({ tools: true, fast: true }), notes: 'Gratis' },
            { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash Exp (Free)', inputPrice: 0, outputPrice: 0, capabilities: cap({ vision: true, fast: true }), notes: 'Gratis' },
            { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', inputPrice: 0.14, outputPrice: 0.28, capabilities: cap({ tools: true, fast: true }) },
            { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', inputPrice: 0.55, outputPrice: 2.19, capabilities: cap({ reasoning: true, tools: true }) },
            { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', inputPrice: 3.00, outputPrice: 15.00, capabilities: cap({ vision: true, tools: true }) },
            { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', inputPrice: 0.15, outputPrice: 0.60, capabilities: cap({ vision: true, tools: true, fast: true }) },
            { id: 'openai/gpt-4o', label: 'GPT-4o', inputPrice: 2.50, outputPrice: 10.00, capabilities: cap({ vision: true, tools: true }) },
        ],
    },
    {
        id: 'kiro',
        name: 'Kiro',
        description: 'AI native dari Kiro IDE',
        placeholder: 'kiro-...',
        hasBaseUrl: true,
        signupUrl: 'https://kiro.dev',
        models: [
            { id: 'kiro-claude-sonnet-4', label: 'Kiro Claude Sonnet 4', inputPrice: 0, outputPrice: 0, capabilities: cap({ vision: true, tools: true, reasoning: true }), notes: 'Via Kiro proxy' },
            { id: 'kiro-claude-opus-4', label: 'Kiro Claude Opus 4', inputPrice: 0, outputPrice: 0, capabilities: cap({ vision: true, tools: true, reasoning: true }), notes: 'Via Kiro proxy' },
        ],
    },
    {
        id: 'openai-compatible',
        name: 'OpenAI Compatible',
        description: 'Custom endpoint (Together, Fireworks, Ollama, dll)',
        placeholder: 'API key...',
        hasBaseUrl: true,
        models: [],
    },
];

/** Lookup helpers */
export function getProvider(id: ProviderId): ProviderInfo | undefined {
    return PROVIDERS.find(p => p.id === id);
}

export function getModel(providerId: ProviderId, modelId: string): ModelInfo | undefined {
    return getProvider(providerId)?.models.find(m => m.id === modelId);
}

/** All models flattened, sorted by input price ascending */
export function allModelsSorted(): Array<ModelInfo & { providerId: ProviderId; providerName: string }> {
    return PROVIDERS.flatMap(p =>
        p.models.map(m => ({ ...m, providerId: p.id, providerName: p.name })),
    ).sort((a, b) => a.inputPrice - b.inputPrice);
}

/** Price tier for visual badges */
export function priceTier(input: number): { label: string; cls: string } {
    if (input === 0) return { label: 'Gratis', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (input < 0.50) return { label: 'Murah', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (input < 2) return { label: 'Hemat', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (input < 10) return { label: 'Standar', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'Premium', cls: 'bg-rose-100 text-rose-700 border-rose-200' };
}
