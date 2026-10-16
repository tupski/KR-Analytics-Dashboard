import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        // Mirror the "@/*" -> "./*" path mapping from tsconfig.json so test files
        // and modules under test resolve imports the same way Next.js does.
        alias: {
            '@': fileURLToPath(new URL('.', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        globals: true,
    },
})
