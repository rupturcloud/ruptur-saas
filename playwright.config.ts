import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration
 * E2E tests for Ruptur SaaS Payment Workflow
 */

const FRONTEND_HOST = process.env.FRONTEND_HOST || 'localhost';
const FRONTEND_PORT = process.env.FRONTEND_PORT || '5173';
const FRONTEND_BASE_URL = `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.PORT_API || '3001';
const API_BASE_URL = process.env.API_BASE_URL || `http://${API_HOST}:${API_PORT}`;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  use: {
    baseURL: FRONTEND_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: [
    {
      command: `npm --prefix web/client-area run dev`,
      url: `${FRONTEND_BASE_URL}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `API_HOST=${API_HOST} PORT_API=${API_PORT} GETNET_WEBHOOK_SECRET=${process.env.GETNET_WEBHOOK_SECRET || 'playwright-getnet-secret'} node api/gateway.mjs`,
      url: `${API_BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile tests
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
