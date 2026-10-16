// Global test setup for Vitest.
//
// Registers @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveClass, ...) with Vitest's `expect` for every test project. The
// `/vitest` entry point is the supported v6 integration (the older
// `/extend-expect` path was removed).
import '@testing-library/jest-dom/vitest'
