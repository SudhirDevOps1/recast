import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@recast/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@recast/editor': path.resolve(__dirname, 'packages/editor/src'),
      '@recast/capture': path.resolve(__dirname, 'packages/capture/src'),
      '@recast/export': path.resolve(__dirname, 'packages/export/src'),
      '@recast/ui': path.resolve(__dirname, 'packages/ui/src'),
    },
  },
});
