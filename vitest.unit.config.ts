import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/firestore.rules.test.ts', 'tests/*.rules.test.ts', 'node_modules/**'],
  },
});
