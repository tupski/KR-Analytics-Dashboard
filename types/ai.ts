/**
 * AI-specific types for KRAI (Kakarama AI) features.
 *
 * These types cover insight cache, chat history, provider models,
 * and AI tooling used across the application.
 */

/** Step-by-step thinking log from AI chat (verbose mode) */
export interface ThinkingStep {
    type: 'think' | 'tool_call' | 'tool_result' | 'compose';
    label: string;
    detail?: string;
    data?: any;
}

// ─── AI Insight ───

export interface AIInsightRequest {
    page: string;
    reportPeriodMode?: string;
    rangeStart?: string;
    rangeEnd?: string;
    comparisonStart?: string;
    comparisonEnd?: string;
    location?: string;
    forceRefresh?: boolean;
}

export interface AIInsightResponse {
    insight: string;
    generatedAt: string;
    providerSlug?: string;
    modelId?: string;
    cached: boolean;
}

// ─── AI Insight Cache (from db) ───

export interface AIInsightCacheEntry {
    id: string;
    cacheKey: string;
    page: string;
    providerSlug: string | null;
    modelId: string | null;
    reportPeriodMode: string | null;
    rangeStart: string | null;
    rangeEnd: string | null;
    comparisonStart: string | null;
    comparisonEnd: string | null;
    inputHash: string | null;
    response: unknown;
    generatedAt: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}

// ─── KRAI Chat ───

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    model?: string;
    provider?: string;
}

export interface KraiConversation {
    id: string;
    scope: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}

export interface KraiSetting {
    key: string;
    value: unknown;
    updatedAt: string;
}

// ─── AI Provider Models ───

export interface AiProviderModel {
    id: number;
    providerSlug: string;
    providerName: string;
    modelId: string;
    displayName: string;
    enabled: boolean;
    capabilities: {
        vision?: boolean;
        streaming?: boolean;
        functionCalling?: boolean;
        reasoning?: boolean;
    } | null;
    pricing: {
        input?: number;
        output?: number;
        currency?: string;
    } | null;
    raw: unknown | null;
    lastFetchedAt: string;
    createdAt: string;
    updatedAt: string;
}

// ─── AI Tooling ───

export interface AIToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: string;
    enabled: boolean;
}

export interface AIToolCall {
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
    error?: string;
}

export interface AIFollowUpQuestion {
    text: string;
    context?: string;
}

// ─── AI Provider Config ───

export interface AIProviderConfig {
    slug: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
    models?: AiProviderModel[];
}

export interface AIChatConfig {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    selectedModel?: string;
}

// ─── AI Response Parsing ───

export interface ParsedAIResponse {
    content: string;
    toolCalls?: AIToolCall[];
    followUpQuestions?: AIFollowUpQuestion[];
    error?: string;
}
