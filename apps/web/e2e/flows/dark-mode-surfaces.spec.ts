import type { Page, TestInfo } from '@playwright/test';
import { cleanupProject, createTestCommit, createTestProject } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';
import { generateNodes } from '../fixtures/test-data-factory';

const SURFACE_TOKENS = [
  '--surface-app',
  '--surface-panel',
  '--surface-card',
  '--surface-elevated',
] as const;

interface ReleaseSurfaceRoute {
  name: string;
  path: string;
  ready: (page: Page) => Promise<void>;
}

function isBenignConsoleError(text: string): boolean {
  return text.includes('/favicon.ico') || text.includes('/manifest.json');
}

async function assertNoHorizontalOverflow(page: Page, routeName: string) {
  const metrics = await page.evaluate(() => {
    const documentWidth = Math.ceil(document.documentElement.scrollWidth);
    const bodyWidth = Math.ceil(document.body.scrollWidth);
    return {
      viewportWidth: window.innerWidth,
      widest: Math.max(documentWidth, bodyWidth),
    };
  });

  expect(
    metrics.widest,
    `${routeName} overflows horizontally: viewport=${metrics.viewportWidth}, width=${metrics.widest}`
  ).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

async function assertDarkSurfaceTokens(page: Page, routeName: string) {
  const tokenValues = await page.evaluate((tokenNames) => {
    const styles = getComputedStyle(document.documentElement);
    return tokenNames.map((name) => ({
      name,
      value: styles.getPropertyValue(name).trim(),
    }));
  }, [...SURFACE_TOKENS]);

  expect(
    tokenValues.filter((token) => token.value === ''),
    `${routeName} has unresolved dark surface tokens`
  ).toEqual([]);
  expect(
    new Set(tokenValues.map((token) => token.value)).size,
    `${routeName} should expose distinct app/panel/card/elevated dark surfaces`
  ).toBe(SURFACE_TOKENS.length);
}

async function assertHealthyDesktopSurface(
  page: Page,
  route: ReleaseSurfaceRoute,
  errors: string[],
  testInfo: TestInfo
) {
  errors.length = 0;

  const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  expect(response?.status() ?? 200, `${route.name} returned an HTTP error`).toBeLessThan(400);

  await route.ready(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(true);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length, `${route.name} rendered a nearly blank body`).toBeGreaterThan(80);
  expect(bodyText).not.toMatch(
    /Unhandled Runtime Error|Application error|Build Error|Module not found|This page could not be found/i
  );

  await assertDarkSurfaceTokens(page, route.name);
  await assertNoHorizontalOverflow(page, route.name);
  expect(errors, `Unexpected console errors on ${route.name}`).toEqual([]);

  await testInfo.attach(`dark-${route.name}`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}

test.describe('desktop dark-mode release surfaces', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;

  test.beforeAll(async ({ request }) => {
    const project = await createTestProject(request, `Dark Surface E2E ${Date.now()}`);
    projectId = project.projectId;
    await createTestCommit(request, projectId, generateNodes(2), {
      branch: 'main',
      message: 'Dark surface ledger checkpoint',
    });
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  test('renders secondary desktop release surfaces cleanly in dark mode', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (isBenignConsoleError(text)) return;
      errors.push(`console.error: ${text}`);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'dark');
      document.documentElement?.classList.add('dark');
    });

    const routes: ReleaseSurfaceRoute[] = [
      {
        name: 'settings-preferences',
        path: '/settings/preferences',
        ready: async (p) => {
          await expect(p.getByRole('heading', { name: 'Preferences' })).toBeVisible();
          await expect(p.getByRole('heading', { name: 'Model Defaults' })).toBeVisible();
        },
      },
      {
        name: 'settings-providers',
        path: '/settings/providers',
        ready: async (p) => {
          await expect(p.getByRole('heading', { name: 'Providers' })).toBeVisible();
          await expect(p.getByText('Configure LLM, embedding, and NLP providers')).toBeVisible();
        },
      },
      {
        name: 'templates',
        path: '/templates',
        ready: async (p) => {
          await expect(p.getByRole('heading', { name: 'Template Gallery' })).toBeVisible();
          await expect(p.getByRole('button', { name: 'Create Template' })).toBeVisible();
        },
      },
      {
        name: 'insights-ledger',
        path: '/insights',
        ready: async (p) => {
          const ledger = p.getByRole('region', { name: 'Semantic commit ledger' });
          await expect(ledger).toBeVisible({ timeout: 15_000 });
          await expect(ledger.getByText('Dark surface ledger checkpoint')).toBeVisible({
            timeout: 15_000,
          });
        },
      },
    ];

    for (const route of routes) {
      await test.step(route.name, async () => {
        await assertHealthyDesktopSurface(page, route, errors, testInfo);
      });
    }
  });
});
