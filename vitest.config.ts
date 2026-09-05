import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/tests/**/*.test.ts', 'infra/tests/**/*.test.ts'],
    /**
     * A fixed test environment.
     *
     * `getConfig()` is memoised at cold start and validates everything at once -
     * without these values, any test that touches config (jwt, for instance)
     * would fail on missing configuration instead of on the rule under test. The
     * Mongo URI is never used: no test here opens a connection.
     */
    env: {
      MONGODB_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-abcdef',
      JWT_TTL: '1h',
      // Present so provider code gets past its "no key configured" guard and
      // actually builds a request. Every test that uses it stubs `fetch`, so
      // nothing here ever reaches OpenRouter.
      OPENROUTER_API_KEY: 'test-key-never-sent-anywhere',
    },
  },
});
