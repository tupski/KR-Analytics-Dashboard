/**
 * Zod Validation Schemas for Server Actions
 *
 * Centralized validation schemas for all user inputs.
 * Separated from 'use server' files because Next.js only allows
 * async function exports from server action modules.
 */

import { z } from 'zod';
import { VALIDATION } from '@/lib/config/constants';

// ═══════════════════════════════════════════════════════════════════
// App Settings Validation
// ═══════════════════════════════════════════════════════════════════

/** Schema for validating app settings updates */
export const AppSettingsSchema = z.object({
    app_name: z
        .string()
        .min(VALIDATION.MIN_STRING_LENGTH, { message: 'Nama aplikasi tidak boleh kosong' })
        .max(VALIDATION.MAX_APP_NAME_LENGTH, { message: `Nama aplikasi maksimal ${VALIDATION.MAX_APP_NAME_LENGTH} karakter` })
        .optional(),
    logo_url: z
        .union([z.string().url({ message: 'URL logo tidak valid' }), z.literal(''), z.null()])
        .optional(),
    favicon_url: z
        .union([z.string().url({ message: 'URL favicon tidak valid' }), z.literal(''), z.null()])
        .optional(),
    primary_color: z
        .string()
        .regex(VALIDATION.HEX_COLOR_REGEX, { message: 'Format warna tidak valid (contoh: #2563eb)' })
        .optional(),
    report_period_mode: z
        .enum(['calendar_day', 'hotel_day'] as const)
        .optional(),
    timezone: z
        .string()
        .min(1, { message: 'Timezone tidak boleh kosong' })
        .optional(),
    sidebar_behavior: z
        .enum(['default', 'collapsed', 'auto', 'collapse', 'hidden'] as const)
        .optional(),
    compact_display: z
        .enum(['true', 'false'] as const)
        .optional(),
    // AI Insight settings
    ai_insight_enabled: z
        .enum(['true', 'false'] as const)
        .optional(),
    ai_insight_mode: z
        .enum(['ai-only', 'fallback-only', 'ai-with-fallback'] as const)
        .optional(),
    ai_insight_provider: z.string().optional(),
    ai_insight_model: z.string().optional(),
    ai_insight_cache_ttl_minutes: z
        .string()
        .regex(/^\d+$/, { message: 'Cache TTL harus berupa angka' })
        .optional(),
    ai_insight_auto_refresh: z
        .enum(['true', 'false'] as const)
        .optional(),
    // System tab — chat history retention
    chat_history_retention_days: z.coerce
        .number()
        .int()
        .min(0, { message: 'Minimal 0 hari' })
        .max(365, { message: 'Maksimal 365 hari' })
        .optional(),
});

/** Type inferred from schema */
export type AppSettingsInput = z.infer<typeof AppSettingsSchema>;

// ═══════════════════════════════════════════════════════════════════
// AI Config Validation
// ═══════════════════════════════════════════════════════════════════

export const AIConfigSchema = z.object({
    provider: z.string().min(1, { message: 'Provider tidak boleh kosong' }),
    apiKey: z.string().min(1, { message: 'API key tidak boleh kosong' }),
    model: z.string().min(1, { message: 'Model tidak boleh kosong' }),
    baseUrl: z.string().url({ message: 'Base URL tidak valid' }).optional(),
    thinkingMode: z.enum(['auto', 'instant', 'thinking'] as const).optional(),
});

export type AIConfigInput = z.infer<typeof AIConfigSchema>;

// ═══════════════════════════════════════════════════════════════════
// Upload Validation
// ═══════════════════════════════════════════════════════════════════

export const CatboxUploadSchema = z.object({
    file: z.object({
        name: z.string(),
        size: z.number().max(20 * 1024 * 1024, { message: 'Ukuran file maksimal 20MB' }),
        type: z.string().regex(/^image\/(png|jpg|jpeg|gif|webp|svg)$/, { message: 'Format file tidak didukung' }),
    }),
});

export type CatboxUploadInput = z.infer<typeof CatboxUploadSchema>;

// ═══════════════════════════════════════════════════════════════════
// Validation Helpers
// ═══════════════════════════════════════════════════════════════════

export interface ValidationResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    fieldErrors?: Record<string, string>;
}

/**
 * Validate input using a Zod schema
 */
export function validateInput<T>(
    schema: z.ZodType<T>,
    input: unknown,
): ValidationResult<T> {
    const result = schema.safeParse(input);

    if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        const firstIssue = result.error.issues[0];

        if (firstIssue) {
            const fieldName = firstIssue.path.join('.') || 'unknown';
            fieldErrors[fieldName] = firstIssue.message;
        }

        return {
            success: false,
            error: result.error.issues[0]?.message || 'Input tidak valid',
            fieldErrors,
        };
    }

    return { success: true, data: result.data };
}
