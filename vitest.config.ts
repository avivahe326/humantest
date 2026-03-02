import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
