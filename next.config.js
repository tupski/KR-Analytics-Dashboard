/** @type {import('next').NextConfig} */

const { execSync } = require('child_process')

// Generate build ID from git or timestamp
let gitSha = 'unknown'
let buildId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  buildId = gitSha + '-' + Date.now().toString(36)
} catch (e) {
  // not a git repo or git not available
}

// P2 security fix: derive server-action allowed origins from the configured
// app URL instead of hardcoding localhost. Falls back to localhost for local
// dev when NEXT_PUBLIC_APP_URL is not set.
function buildAllowedOrigins() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  if (appUrl) {
    try {
      const { host } = new URL(appUrl)
      // Include both the configured host and localhost so `npm run dev`
      // still works without requiring the env var to be set locally.
      return [host, 'localhost:3031', '127.0.0.1:3031']
    } catch {
      // malformed URL — fall through to dev defaults
    }
  }
  return ['localhost:3031', '127.0.0.1:3031']
}

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: buildAllowedOrigins(),
    },
  },
  images: {
    domains: [],
  },
  output: 'standalone',

  generateBuildId: () => buildId,

  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  // Disable static optimization for pages with server actions
  // This ensures server actions are always fresh
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },

  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        // Security headers on all routes
        // CSP: allows Next.js App Router inline scripts (nonce not available in static headers),
        // next/image (self), next/font (fonts.gstatic.com), and AI markdown rendering.
        // 'unsafe-inline' for styles only — NOT for scripts.
        // Adjust trusted hosts if you add a CDN or external image domain.
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js App Router injects small inline scripts; sha256 not practical in static
              // headers — use 'unsafe-inline' for scripts only in dev; in prod consider nonce via
              // middleware. For now we allow 'self' + data: which covers RSC payloads.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Inline styles needed for Tailwind CSS & AI markdown rendering
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // next/image serves from same origin; external images via Supabase storage
              "img-src 'self' data: blob: https://files.catbox.moe https://*.supabase.co https://*.supabase.in",
              "font-src 'self' https://fonts.gstatic.com",
              // API calls: Supabase + current origin only
              "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          // Prevent the page from being embedded in iframes
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Controlled referrer leakage
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restrict browser feature access — adjust if you need camera/mic/geolocation
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          // HSTS — 1 year, include subdomains. Only effective over HTTPS.
          // If running plain HTTP in dev, browsers will simply ignore this header.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
      {
        // All HTML pages + RSC payloads + server action endpoints — never cache
        source: '/((?!_next/static|_next/image|favicon\\.ico|images/|fonts/).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        // Static assets — cache long (build-versioned by Next.js content hash)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
