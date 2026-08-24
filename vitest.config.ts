/**
 * Vitest config for the Masary app.
 * Tests pure utils + extraction schema (node env, no RN runtime needed).
 * Used by: `npm test` / CI.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': new URL('.', import.meta.url).pathname },
  },
});
