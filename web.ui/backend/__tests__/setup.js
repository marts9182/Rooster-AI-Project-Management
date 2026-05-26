/**
 * Vitest setup file - runs before any tests.
 * Sets PORT=0 to prevent server from actually listening during tests.
 */
process.env.PORT = '0';
