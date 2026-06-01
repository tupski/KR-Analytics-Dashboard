/**
 * Standardized Error Handling Utilities
 *
 * Provides consistent error handling patterns across all action files.
 * All server actions should use these utilities for error propagation.
 */

/**
 * Result type for server action responses.
 * Uses the discriminated union pattern for type-safe error handling.
 */
export interface ActionSuccess<T> {
    success: true;
    data: T;
}

export interface ActionFailure {
    success: false;
    error: string;
    code?: string;
    originalError?: unknown;
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/**
 * Error codes for standardized error responses
 */
export const ErrorCodes = {
    DATABASE_ERROR: 'DATABASE_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Wraps an async operation in standardized error handling.
 * Returns ActionResult<T> — never throws.
 *
 * @param operation Async function to execute
 * @param context Human-readable context for error messages
 * @param errorCode Optional error code for categorization
 * @returns ActionResult with success data or failure info
 */
export async function safeAction<T>(
    operation: () => Promise<T>,
    context: string,
    errorCode?: ErrorCode,
): Promise<ActionResult<T>> {
    try {
        const data = await operation();
        return { success: true, data };
    } catch (error: unknown) {
        // Log the full error for debugging
        console.error(`[safeAction] ${context}:`, error);

        // Extract user-friendly message
        const errorMessage = error instanceof Error
            ? error.message
            : typeof error === 'string'
                ? error
                : `Terjadi kesalahan: ${context}`;

        return {
            success: false,
            error: errorMessage,
            code: errorCode ?? ErrorCodes.INTERNAL_ERROR,
            originalError: error,
        };
    }
}

/**
 * Wraps a Supabase query with standardized error handling.
 * Automatically extracts error message from Supabase response.
 *
 * @param query Supabase query promise
 * @param context Human-readable context
 * @returns The data on success, or null on failure (with error logged)
 */
export async function safeQuery<T>(
    query: Promise<{ data: T | null; error: { message: string } | null }>,
    context: string,
): Promise<T | null> {
    try {
        const { data, error } = await query;
        if (error) {
            console.error(`[safeQuery] ${context}:`, error.message);
            return null;
        }
        return data;
    } catch (error: unknown) {
        console.error(`[safeQuery] Unexpected ${context}:`, error);
        return null;
    }
}

/**
 * Type guard for checking action success
 */
export function isSuccess<T>(result: ActionResult<T>): result is ActionSuccess<T> {
    return result.success === true;
}

/**
 * Type guard for checking action failure
 */
export function isFailure<T>(result: ActionResult<T>): result is ActionFailure {
    return result.success === false;
}

/**
 * Convert an unknown error to a user-friendly string
 */
export function getErrorMessage(error: unknown, fallback: string = 'Terjadi kesalahan'): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return fallback;
}
