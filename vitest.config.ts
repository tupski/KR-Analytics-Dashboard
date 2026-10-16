import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Shared Vite options applied to every test project below.
//
// JSX: tsconfig.json sets `"jsx": "preserve"` because Next.js performs the
// actual JSX transform during its build. Vite 8 (oxc transform) cannot run
// preserved JSX in the module graph, so we override it here with the automatic
// runtime. This is the smallest change that makes TSX test files and React
// components transformable without touching the app's build config.
const sharedVite = {
    resolve: {
        // Mirror the "@/*" -> "./*" path mapping from tsconfig.json so test files
        // and modules under test resolve imports the same way Next.js does.
        alias: {
            '@': fileURLToPath(new URL('.', import.meta.url)),
            // jest-dom v6 removed the `/extend-expect` entry point that the
            // recovered historical component tests import. Map the legacy
            // specifier onto the current Vitest entry point so those test files
            // run unmodified.
            '@testing-library/jest-dom/extend-expect': '@testing-library/jest-dom/vitest',
        },
    },
    oxc: {
        jsx: {
            runtime: 'automatic' as const,
            importSource: 'react',
        },
    },
}

export default defineConfig({
    ...sharedVite,
    test: {
        globals: true,
        // Register jest-dom matchers (toBeInTheDocument, toHaveClass, ...) once
        // for every project instead of relying on per-file imports.
        setupFiles: ['./vitest.setup.ts'],
        // One canonical runner (Vitest). Environment is chosen per test category:
        //   - unit/node:       pure logic, services, server actions
        //   - component/jsdom: React components rendered with @testing-library/react
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: [
                        'lib/**/*.{test,spec}.{ts,tsx}',
                        'app/**/*.{test,spec}.{ts,tsx}',
                    ],
                },
            },
            {
                extends: true,
                test: {
                    name: 'component',
                    environment: 'jsdom',
                    include: ['components/**/*.{test,spec}.{ts,tsx}'],
                },
            },
        ],
    },
})
