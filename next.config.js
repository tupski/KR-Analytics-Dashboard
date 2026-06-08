/** @type {import('next').NextConfig} */

const { execSync } = require('child_process')

// Generate build ID from git or timestamp
let gitSha = 'unknown'
let buildId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim()
  buildId = gitSha + '-' + Date.now().toString(36)
} catch (e) {
  // not a git repo or git not available
}

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: ['localhost:3000', '127.0.0.1:3000'],
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
