/**
 * In-memory rate limiting utilities.
 *
 * Implementation notes:
 * - Sliding-window (fixed-window with per-key reset) token bucket, single-instance only.
 *   Resets on server restart — acceptable for this deployment topology (one container).
 * - Keys may be derived from an IP, a user id, or both. Prefer a user id when the
 *   session is known, and always include the IP for unauthenticated endpoints (login).
 * - Follows the error handling conventions in lib/utils/errors.ts (never throws;
 *   returns a structured result) and emits standard RateLimit-* headers.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export interface RateLimitOptions {
    /** Unique namespace per endpoint/use-case (e.g. 'ai-chat', 'login'). */
    namespace: string;
    /** Maximum number of allowed requests within windowMs. */
    limit: number;
    /** Window length in milliseconds. */
    windowMs: number;
    /** Request key — typically an IP address and/or user id. */
    key: string;
}

export interface RateLimitResult {
    allowed: boolean;
    /** Remaining requests in the current window (0 when blocked). */
    remaining: number;
    /** Milliseconds until the window resets (0 when blocked). */
    retryAfterMs: number;
    /** Ms when the current window expires (epoch). */
    resetAt: number;
    /** Window length in ms — for X-RateLimit-Limit header. */
    limit: number;
}

interface Bucket {
    count: number;
    resetAt: number;
}

// Map<namespace, Map<key, Bucket>>
const buckets = new Map<string, Map<string, Bucket>>();

/**
 * Sliding-window rate limiter (in-memory, per-process).
 *
 * @returns {RateLimitResult} Structured result — never throws.
 */
export function rateLimit({ namespace, limit, windowMs, key }: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const windowKey = namespace;

    let namespaceBuckets = buckets.get(windowKey);
    if (!namespaceBuckets) {
        namespaceBuckets = new Map<string, Bucket>();
        buckets.set(windowKey, namespaceBuckets);
    }

    const entry = namespaceBuckets.get(key);

    // First request in this window (or expired window) → allow, start fresh window.
    if (!entry || entry.resetAt <= now) {
        const resetAt = now + windowMs;
        namespaceBuckets.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: limit - 1, retryAfterMs: 0, resetAt, limit };
    }

    // Window still open.
    if (entry.count >= limit) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs: entry.resetAt - now,
            resetAt: entry.resetAt,
            limit,
        };
    }

    entry.count += 1;
    return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0, resetAt: entry.resetAt, limit };
}

/**
 * Best-effort periodic cleanup so the Map does not grow unbounded with
 * one-off IP keys (e.g. failed logins). Expired buckets are removed.
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

function sweepExpiredBuckets(): void {
    const now = Date.now();
    for (const [namespace, namespaceBuckets] of buckets) {
        for (const [key, bucket] of namespaceBuckets) {
            if (bucket.resetAt <= now) {
                namespaceBuckets.delete(key);
            }
        }
        if (namespaceBuckets.size === 0) {
            buckets.delete(namespace);
        }
    }
}

// Unref the timer so it never keeps the process alive in tests/CLI.
if (typeof setInterval === 'function') {
    const timer = setInterval(sweepExpiredBuckets, CLEANUP_INTERVAL_MS);
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref?: () => void }).unref?.();
    }
}

/**
 * Derive a stable rate-limit key from an IP address.
 * Falls back to a constant so an undetectable client still gets throttled
 * (shared key instead of no key).
 */
export function ipKey(ip: string | null | undefined): string {
    return `ip:${ip?.trim() || 'unknown'}`;
}

/**
 * Derive a rate-limit key that scopes per user when available, else per IP.
 */
export function userOrIpKey(userId: string | null | undefined, ip: string | null | undefined): string {
    if (userId) return `user:${userId}`;
    return ipKey(ip);
}

/**
 * Extract the client IP, honoring common proxy headers.
 * `next/headers` exposes `x-forwarded-for` from the runtime; middleware
 * deployments (e.g. Vercel) rewrite it, so only trust the first value.
 */
export function getClientIp(request: Request | NextRequest): string | null {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
    return null;
}

/**
 * Standard rate-limit headers applied to a response.
 * X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset (epoch seconds).
 */
export function applyRateLimitHeaders(response: NextResponse, result: RateLimitResult): void {
    response.headers.set('X-RateLimit-Limit', String(result.limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
}

/**
 * Build a 429 response with standard rate-limit headers.
 * Reuses the standardized error body shape from lib/api-response.
 */
export function rateLimitResponse(result: RateLimitResult, message: string = 'Too many requests'): NextResponse {
    const response = NextResponse.json(
        {
            success: false,
            error: {
                code: 'RATE_LIMITED',
                message,
            },
        },
        { status: 429 },
    );
    applyRateLimitHeaders(response, result);
    response.headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    return response;
}
