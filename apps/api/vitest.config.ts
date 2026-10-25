import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/unused-in-tests',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      LOG_LEVEL: 'silent',
      INBOUND_DOMAIN: 'in.finapp.test',
      INBOUND_SECRET: 'test-inbound-secret-at-least-32-characters',
    },
  },
});
