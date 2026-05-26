import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.js'],
    globals: false,
    testTimeout: 10_000,
    setupFiles: ['./__tests__/setup.js'],
  },
});
