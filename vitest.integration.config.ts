import { defineConfig } from 'vitest/config'

/** Live FMP calls — run with `fmpApiKey` in `.env.local` (same as Vite dev). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
  },
})
