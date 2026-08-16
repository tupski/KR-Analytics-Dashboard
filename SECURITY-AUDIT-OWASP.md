# KR Analytics Dashboard — Security Audit (OWASP)

**Project:** KR Analytics Dashboard (Kakarama Room)
**Audit Date:** 2026-08-16
**Remediation Completed:** 2026-08-16
**Auditor:** Internal security review (OWASP Top 10 framework)
**Stack:** Next.js 15 · TypeScript · Supabase/Postgres · Docker

---

## Executive Summary

A three-wave security remediation program was completed covering all Critical, High, and Medium
findings identified during the initial OWASP-aligned audit. The production build compiles without
type errors or lint errors. All sensitive API routes are now protected by per-route auth guards
and rate limiting as defense-in-depth on top of the existing middleware.

**Status: All Critical, High, Medium, and Low findings resolved.**

---

## Remediation Status

| ID   | Severity | Finding                                          | Status     | Fixed In                                                                 |
|------|----------|--------------------------------------------------|------------|--------------------------------------------------------------------------|
| P0-1 | Critical | No rate limiting on AI/login endpoints           | ✅ Fixed   | `lib/security/rate-limit.ts`, all AI routes + login route                |
| P0-2 | Critical | API routes rely solely on middleware for auth    | ✅ Fixed   | `lib/security/guard.ts`, all sensitive API routes                        |
| H-1  | High     | XLSX formula injection                           | ✅ Fixed   | `lib/export/xlsx.ts`                                                     |
| H-2  | High     | Missing security headers                         | ✅ Fixed   | `next.config.js`                                                         |
| H-3  | High     | Server actions without session check             | ✅ Fixed   | `app/(dashboard)/**/actions.ts`                                          |
| H-4  | High     | KRAI history IDOR + unbounded payload            | ✅ Fixed   | `app/api/krai/history/route.ts`                                          |
| H-5  | High     | `/api/revalidate` without mandatory secret       | ✅ Fixed   | `app/api/revalidate/route.ts`                                            |
| M-1  | Medium   | `dangerouslySetInnerHTML` on raw AI output       | ✅ Fixed   | `components/ai/MarkdownRenderer.tsx`                                     |
| M-2  | Medium   | Open redirect in login flow                      | ✅ Fixed   | `app/api/auth/login/route.ts`                                            |
| M-3  | Medium   | Public debug endpoint in production              | ✅ Fixed   | `app/api/debug/build/route.ts`                                           |
| M-4  | Medium   | `allowedOrigins` hardcoded in config             | ✅ Fixed   | `next.config.js`                                                         |
| M-5  | Medium   | Upload endpoint missing server-side type/size validation | ✅ Fixed | `app/api/upload/catbox/route.ts`                                      |

---

## Wave 1 — Critical Findings

### P0-1 · Rate Limiting (Critical)

**Risk:** Unauthenticated and authenticated AI endpoints had no rate limiting, allowing brute-force
login attacks and AI API cost exhaustion.

**Fix:** `lib/security/rate-limit.ts` — in-memory sliding-window token bucket with per-namespace
per-key counters. Emits standard `RateLimit-*` / `Retry-After` response headers.
Automatic periodic sweep prevents unbounded memory growth.

Applied to:
- `app/api/ai/chat/route.ts` — 20 req / 1 min per user
- `app/api/ai/insight/route.ts` — per user
- `app/api/krai/history/route.ts` — per user
- `app/api/upload/catbox/route.ts` — 10 req / 10 min per user
- `app/api/auth/login/route.ts` — 10 req / 15 min per IP (unauthenticated)

### P0-2 · Per-Route Auth Guards (Critical)

**Risk:** Middleware matcher configuration could silently omit newly added routes, leaving them
unauthenticated.

**Fix:** `lib/security/guard.ts` — `requireUser()` and `requireAdmin()` helpers perform a
server-side Supabase `getUser()` call inside each handler, independent of middleware. The
`isGuardError()` type guard provides clean early-return patterns.

---

## Wave 2 — High Findings

### H-1 · XLSX Formula Injection (High)

**Risk:** Exporting user-controlled strings to XLSX without sanitization allows CSV/formula
injection (e.g. `=HYPERLINK(...)`) that executes when opened in Excel/LibreOffice.

**Fix:** `lib/export/xlsx.ts` — `escapeFormulaInjection()` prefixes cells starting with
`=`, `+`, `-`, or `@` with a single-quote to force Excel to treat them as literal text.

### H-2 · Missing Security Headers (High)

**Risk:** No CSP, no `X-Frame-Options`, no HSTS, no `X-Content-Type-Options`. Pages were
embeddable in iframes and vulnerable to clickjacking and MIME-sniffing attacks.

**Fix:** `next.config.js` `headers()` — added full security header suite:
- `Content-Security-Policy` — restricts script/style/img/font/connect sources; blocks inline
  eval; includes `frame-ancestors 'none'` and `upgrade-insecure-requests`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables camera, mic, geolocation, payment, USB, FLoC
- `Strict-Transport-Security` — 1 year, includeSubDomains

### H-3 · Server Actions Without Session Check (High)

**Risk:** Next.js server actions in `app/(dashboard)` were callable without verifying the
caller's session, bypassing middleware protection entirely.

**Fix:** Session and role checks added to all server action files:
- `app/(dashboard)/booking/actions.ts`
- `app/(dashboard)/laporan/actions.ts`
- `app/(dashboard)/pengaturan/actions.ts`
- `app/(dashboard)/pengaturan/ai-actions.ts`
- `app/(dashboard)/unit/actions.ts`

### H-4 · KRAI History IDOR + Unbounded Payload (High)

**Risk:** The KRAI history endpoint did not filter by the authenticated user's ID, allowing any
authenticated user to read another user's AI conversation history (IDOR). No payload size limit
allowed oversized write requests.

**Fix:** `app/api/krai/history/route.ts`:
- Ownership filter: all queries now scoped to `session.user.id`
- Payload size limit enforced server-side before DB write

### H-5 · `/api/revalidate` Without Mandatory Secret (High)

**Risk:** The cache revalidation endpoint accepted any POST request, allowing unauthenticated
callers to flush all server caches at will.

**Fix:** `app/api/revalidate/route.ts` — requires `REVALIDATION_SECRET` env var. Fails closed
(503) if the env var is not configured; returns 401 for missing or non-matching secret.
`REVALIDATION_SECRET` placeholder added to `.env.example`.

---

## Wave 3 — Medium Findings

### M-1 · `dangerouslySetInnerHTML` on Raw AI Output (Medium)

**Risk:** AI-generated markdown was rendered via `dangerouslySetInnerHTML` without HTML escaping,
enabling stored XSS if the AI model returns malicious HTML tags.

**Fix:** `components/ai/MarkdownRenderer.tsx` — `escapeHtml()` applied to AI text output before
it is passed to `dangerouslySetInnerHTML`. HTML entities (`<`, `>`, `&`, `"`, `'`) are replaced
with safe equivalents before the markdown parser runs.

### M-2 · Open Redirect in Login Flow (Medium)

**Risk:** The `redirectTo` query parameter accepted any URL, allowing phishing attacks via
`/login?redirectTo=https://attacker.com`.

**Fix:** `app/api/auth/login/route.ts` — `validateRedirectPath()` rejects any value that does
not start with `/` followed by a non-`/` character, blocking protocol-relative and absolute URLs.
Invalid redirects fall back to `/dashboard`.

### M-3 · Public Debug Endpoint in Production (Medium)

**Risk:** `GET /api/debug/build` exposed build metadata (git SHA, build ID, timestamp) in
production, providing useful reconnaissance data for attackers.

**Fix:** `app/api/debug/build/route.ts` — returns `404 Not Found` when
`NODE_ENV !== 'development'`. The endpoint is only reachable in local dev environments.

### M-4 · `allowedOrigins` Hardcoded (Medium)

**Risk:** `next.config.js` had `serverActions.allowedOrigins` hardcoded to `localhost:3031`,
which would silently reject server actions from the production domain or break cross-origin
deployments.

**Fix:** `next.config.js` `buildAllowedOrigins()` — reads `NEXT_PUBLIC_APP_URL` env var, extracts
the `host`, and includes it alongside the localhost fallbacks. `NEXT_PUBLIC_APP_URL` documented in
`.env.example` with a clear comment explaining its role.

### M-5 · Upload Endpoint Missing Validation (Medium)

**Risk:** The Catbox upload proxy had no server-side MIME type or file size validation, allowing
arbitrary file types and large uploads to be proxied.

**Fix:** `app/api/upload/catbox/route.ts`:
- MIME whitelist: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Max file size: 5 MB (server-side, independent of client-side schema)
- Auth guard (`requireUser`) + rate limit (10 req / 10 min per user)

---

## Low Severity Findings (Wave 4 — 2026-08-16)

All low severity findings have been remediated.

| ID  | Severity | Finding                                        | Status      | Fixed In                                                                     |
|-----|----------|------------------------------------------------|-------------|------------------------------------------------------------------------------|
| L-1 | Low      | `sync-worker` runs as root in container        | ✅ Fixed    | `sync-worker/Dockerfile`                                                     |
| L-2 | Low      | `.dockerignore` does not exclude `.env*` files | ✅ Fixed    | `.dockerignore`, `sync-worker/.dockerignore` (created)                       |
| L-3 | Low      | Dashboard port bound to `0.0.0.0`              | ✅ Fixed    | `docker-compose.yml`                                                         |

### L-1 Fix
`sync-worker/Dockerfile` — added `RUN chown -R node:node /app` followed by `USER node` after
the build step. Uses the built-in `node` user (uid 1000) from the `node:20-alpine` base image.
All remaining `RUN` steps that required root (package install, build) execute before the `USER`
instruction, so the runtime process runs as an unprivileged user.

### L-2 Fix
Root `.dockerignore` — added explicit exclusions: `.env`, `.env.*`, `.env.production`, `*.pem`,
`*.key` with a comment explaining the security intent. The sync-worker build context had no
`.dockerignore` at all; created `sync-worker/.dockerignore` with the same exclusions plus
`node_modules`, `dist`, and other standard ignores.

### L-3 Fix
`docker-compose.yml` — changed the `dashboard` service port binding from `"${DASHBOARD_PORT:-3031}:3000"`
to `"127.0.0.1:${DASHBOARD_PORT:-3031}:3000"`, binding only to the loopback interface.
Added an explanatory comment noting how to change back if external access is required.
The `postgres` and `sync-worker` port bindings already used `127.0.0.1:` and were not changed.

---

## Environment Variables Added During Remediation

The following env vars were introduced by the security fixes and are documented in `.env.example`:

| Variable              | Purpose                                                        | Required      |
|-----------------------|----------------------------------------------------------------|---------------|
| `REVALIDATION_SECRET` | Bearer token for `POST /api/revalidate`. Fail-closed if unset. | Production ✅ |
| `NEXT_PUBLIC_APP_URL` | Production app URL — populates `serverActions.allowedOrigins`. | Production ✅ |

Generate `REVALIDATION_SECRET` with: `openssl rand -hex 32`

---

## Build Verification (Final — 2026-08-16)

| Check              | Result  | Notes                                                          |
|--------------------|---------|----------------------------------------------------------------|
| `tsc --noEmit`     | ✅ Exit 0 | No type errors                                               |
| `npm run lint`     | ✅ Exit 0 | 1 pre-existing warning in `AIChatCore.tsx:1150` (unrelated)  |
| `npm run build`    | ✅ Exit 0 | 32 routes compiled successfully, all dynamic (ƒ)             |

The single lint warning (`react-hooks/exhaustive-deps` in `components/ai/AIChatCore.tsx:1150`) is
pre-existing and unrelated to any security change. It does not block the build.

---

*Report generated: 2026-08-16 · KR Analytics Dashboard security remediation program complete.*
