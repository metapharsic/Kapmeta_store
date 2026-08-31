import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      CREDENTIALS_ENCRYPTION_KEY: 'test-encryption-key-32-chars-long!!',
      JWT_SECRET: 'test-jwt-secret-key-for-auth-testing',
      NODE_ENV: 'test',
    },
  },
});

