import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e configuration.
 *
 * Ordinary runs use existing dev servers at API :8000 and WebUI :3000.
 * The full qualification runner owns isolated external servers and enables
 * durable HTML, JSON, JUnit, trace, screenshot, and service-log artifacts.
 */

const WEBUI_PORT = process.env.WEBUI_PORT ?? '3000';
const API_PORT = process.env.API_PORT ?? '8000';
const WEBUI_URL = process.env.WEBUI_URL ?? `http://localhost:${WEBUI_PORT}`;
const API_URL = process.env.API_URL ?? `http://localhost:${API_PORT}`;
const FULL_QUALIFICATION = process.env.T3X_E2E_FULL === '1';
const EXTERNAL_SERVERS = process.env.T3X_E2E_EXTERNAL_SERVERS === '1';
const repoRoot = path.resolve(process.cwd(), '../..');
const artifactDir = path.resolve(
  repoRoot,
  process.env.T3X_E2E_ARTIFACT_DIR ?? 'test-results/full-e2e'
);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // conversations share DB state
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // Don't auto-abort the suite on failures — audit runs want the full picture.
  // CI stops after 10 failures to bound runtime; local never aborts.
  maxFailures: FULL_QUALIFICATION ? 0 : process.env.CI ? 10 : 0,
  outputDir: path.join(artifactDir, 'results'),
  reporter: FULL_QUALIFICATION
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: path.join(artifactDir, 'html') }],
        ['json', { outputFile: path.join(artifactDir, 'results.json') }],
        ['junit', { outputFile: path.join(artifactDir, 'junit.xml') }],
      ]
    : process.env.CI
      ? 'github'
      : 'list',
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
  webServer:
    process.env.CI && !EXTERNAL_SERVERS
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
