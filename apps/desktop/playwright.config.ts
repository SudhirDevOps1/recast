import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'tests/*.spec.ts',
  timeout: 120_000,
  use: {
    trace: 'retain-on-failure',
  },
  outputDir: 'test-results',
});
