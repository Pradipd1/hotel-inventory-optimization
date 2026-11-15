import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-the-test-suite-only',
      BCRYPT_ROUNDS: '4',
    },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
  },
});
