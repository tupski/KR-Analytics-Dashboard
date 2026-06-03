/**
 * Standardized API Response Utilities
 *
 * Provides consistent response structures for all API routes.
 * Ensures all errors and successes follow the same format.
 */

import { NextResponse } from 'next/server';

/**
 * Standard error response structure
 */
export interface ApiErrorBody {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

/**
 * Standard success response structure
 */
export interface ApiSuccessBody<T = unknown> {
    success: true;
    data: T;
    meta?: {
        timestamp: string;
        [key: string]: unknown;
    };
}

// ═══════════════════════════════════════════════════════════════════
// Error Response Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a standardized error response
 *
 * @param status HTTP status code
 * @param code Machine-readable error code
 * @param message Human-readable error message
 * @param details Optional additional error context
 */
export function apiErrorResponse(
    status: number,
    code: string,
    message: string,
    details?: unknown,
): NextResponse<ApiErrorBody> {
    return NextResponse.json(
        {
            success: false,
            error: {
                code,
                message,
                ...(details !== undefined && { details }),
            },
        },
        { status },
    );
}

/**
 * 400 Bad Request
 */
export function badRequest(message: string, details?: unknown) {
    return apiErrorResponse(400, 'BAD_REQUEST', message, details);
}

/**
 * 401 Unauthorized
 */
export function unauthorized(message: string = 'Authentication required') {
    return apiErrorResponse(401, 'UNAUTHORIZED', message);
}

/**
 * 403 Forbidden
 */
export function forbidden(message: string = 'Access denied') {
    return apiErrorResponse(403, 'FORBIDDEN', message);
}

/**
 * 404 Not Found
 */
export function notFound(message: string = 'Resource not found') {
    return apiErrorResponse(404, 'NOT_FOUND', message);
}

/**
 * 422 Validation Error
 */
export function validationError(message: string, details?: unknown) {
    return apiErrorResponse(422, 'VALIDATION_ERROR', message, details);
}

/**
 * 500 Internal Server Error
 */
export function internalError(message: string = 'Internal server error', details?: unknown) {
    return apiErrorResponse(500, 'INTERNAL_ERROR', message, details);
}

// ═══════════════════════════════════════════════════════════════════
// Success Response Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a standardized success response
 *
 * @param data Response data
 * @param status HTTP status code (default: 200)
 * @param meta Optional metadata
 */
export function apiSuccessResponse<T>(
    data: T,
    status: number = 200,
    meta?: Record<string, unknown>,
): NextResponse<ApiSuccessBody<T>> {
    return NextResponse.json(
        {
            success: true,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                ...meta,
            },
        },
        { status },
    );
}

// ═══════════════════════════════════════════════════════════════════
// Retry Utilities
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute an async function with exponential backoff retry
 *
 * @param fn Async function to execute
 * @param maxRetries Maximum number of retries (default: 3)
 * @param baseDelayMs Base delay in milliseconds (default: 1000)
 * @param retryableErrors Optional set of error messages that should trigger retry
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === maxRetries - 1) {
                throw lastError;
            }

            // Exponential backoff: 1s, 2s, 4s, ...
            const delayMs = baseDelayMs * 2 ** attempt;
            console.warn(
                `[withRetry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms:`,
                lastError.message,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    throw lastError ?? new Error('Max retries exceeded');
}
