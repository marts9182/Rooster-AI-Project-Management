import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      '__tests__/**/*.test.js',
      '**/__tests__/**/*.test.js',
      '../../scripts/__tests__/**/*.test.mjs',
    ],
    globals: false,
    testTimeout: 10_000,
    setupFiles: ['./__tests__/setup.js'],
  },
});
