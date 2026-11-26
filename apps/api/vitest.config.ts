import { defineConfig } from 'vitest/config';

/** API tests run against in-memory dummy data (test/support). They never connect to PostgreSQL. */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
  },
});
