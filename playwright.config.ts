import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],

  /* Run tests in parallel */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  /* Reporter */
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['html', { open: 'on-failure' }]],

  /* Shared settings */
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  /* Timeouts */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* Projects */
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Dev server */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3002',
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
