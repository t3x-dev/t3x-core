import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e configuration.
 *
 * Uses the existing dev servers: API at :8000, WebUI at :3000.
 * If `CI` is set, the `webServer` blocks will spin up the servers;
 * locally, you can start them manually with `pnpm dev:api` + `pnpm dev:webui`
 * and set `reuseExistingServer: true`.
 */

const WEBUI_PORT = process.env.WEBUI_PORT ?? '3000';
const API_PORT = process.env.API_PORT ?? '8000';
const WEBUI_URL = process.env.WEBUI_URL ?? `http://localhost:${WEBUI_PORT}`;
const API_URL = process.env.API_URL ?? `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // conversations share DB state
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // Don't auto-abort the suite on failures — audit runs want the full picture.
  // CI stops after 10 failures to bound runtime; local never aborts.
  maxFailures: process.env.CI ? 10 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: WEBUI_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? [
        {
          command: 'pnpm --filter t3x-api-server dev',
          url: `${API_URL}/api/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          cwd: '../..',
        },
        {
          command: 'pnpm --filter t3x-webui dev',
          url: WEBUI_URL,
          reuseExistingServer: false,
          timeout: 60_000,
          cwd: '../..',
        },
      ]
    : undefined,
});
