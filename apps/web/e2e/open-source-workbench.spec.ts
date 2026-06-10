import {
  cleanupProject,
  createTestCommitFromTrees,
  createTestLeaf,
  createTestMergeDraft,
  createTestProject,
} from './fixtures/api-helpers';
import {
  MERGE_SEMANTIC_CHANGES_DEMO,
  PROMPT_DIFF_DEMO,
} from './fixtures/open-source-demo-datasets';
import { expect, test } from './fixtures/test';

type ThemeMode = 'light' | 'dark';

interface WorkbenchRoute {
  name: string;
  path: () => string;
  ready: (page: import('@playwright/test').Page) => Promise<void>;
}

function encodeHash(hash: string): string {
  return encodeURIComponent(hash);
}

function isBenignConsoleError(text: string): boolean {
  return text.includes('/favicon.ico') || text.includes('/manifest.json');
}

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page, routeName: string) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.ceil(doc.scrollWidth),
      bodyWidth: Math.ceil(body.scrollWidth),
    };
  });

  const widest = Math.max(metrics.documentWidth, metrics.bodyWidth);
  expect(
    widest,
    `${routeName} overflows horizontally: viewport=${metrics.viewportWidth}, width=${widest}`
  ).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

async function assertHealthyRoute(
  page: import('@playwright/test').Page,
  route: WorkbenchRoute,
  errors: string[],
  testInfo: import('@playwright/test').TestInfo,
  theme: ThemeMode
) {
  errors.length = 0;
  const response = await page.goto(route.path(), { waitUntil: 'domcontentloaded' });
  expect(response?.status() ?? 200, `${route.name} returned an HTTP error`).toBeLessThan(400);

  await route.ready(page);
  await page.waitForTimeout(500);

  const bodyText = await page.locator('body').innerText();
  expect(bodyText.trim().length, `${route.name} rendered a nearly blank body`).toBeGreaterThan(40);
  expect(bodyText).not.toMatch(
    /Unhandled Runtime Error|Application error|Build Error|Module not found|This page could not be found/i
  );

  if (theme === 'dark') {
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true);
  }

  await assertNoHorizontalOverflow(page, route.name);
  expect(errors, `Unexpected console errors on ${theme} ${route.name}`).toEqual([]);

  await testInfo.attach(`${theme}-${route.name}`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}

test.describe('Open-source workbench visual smoke', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let promptBaseHash: string;
  let promptTargetHash: string;
  let mergeId: string;
  let leafId: string;

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(
      request,
      `Open Source UI Smoke ${Date.now()}`
    );
    projectId = id;

    promptBaseHash = await createTestCommitFromTrees(request, projectId, PROMPT_DIFF_DEMO.base, {
      branch: 'main',
      message: 'Prompt baseline',
    });
    promptTargetHash = await createTestCommitFromTrees(
      request,
      projectId,
      PROMPT_DIFF_DEMO.target,
      {
        branch: 'main',
        message: 'Prompt revision',
        parents: [promptBaseHash],
      }
    );
    leafId = await createTestLeaf(request, promptTargetHash, projectId);

    const mergeBaseHash = await createTestCommitFromTrees(
      request,
      projectId,
      MERGE_SEMANTIC_CHANGES_DEMO.base,
      { branch: 'main', message: 'Merge baseline' }
    );
    const mergeSourceHash = await createTestCommitFromTrees(
      request,
      projectId,
      MERGE_SEMANTIC_CHANGES_DEMO.source,
      {
        branch: 'phase-two-source',
        message: 'Source semantic edits',
        parents: [mergeBaseHash],
      }
    );
    const mergeTargetHash = await createTestCommitFromTrees(
      request,
      projectId,
      MERGE_SEMANTIC_CHANGES_DEMO.target,
      {
        branch: 'main',
        message: 'Target semantic edits',
        parents: [mergeBaseHash],
      }
    );
    mergeId = await createTestMergeDraft(request, projectId, mergeSourceHash, mergeTargetHash);
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`desktop core surfaces render cleanly in ${theme} mode`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (isBenignConsoleError(text)) return;
        errors.push(`console.error: ${text}`);
      });

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.addInitScript((mode: ThemeMode) => {
        localStorage.setItem('theme', mode);
        document.documentElement?.classList.toggle('dark', mode === 'dark');
      }, theme);

      const routes: WorkbenchRoute[] = [
        {
          name: 'chat-landing',
          path: () => '/chat',
          ready: async (p) => {
            await expect(
              p.getByRole('heading', { name: 'What should T3X structure?' })
            ).toBeVisible();
          },
        },
        {
          name: 'canvas',
          path: () => `/project/${projectId}`,
          ready: async (p) => {
            await expect(p.locator('.react-flow')).toBeVisible({ timeout: 15000 });
            await expect(p.locator('.react-flow__node').first()).toBeVisible({ timeout: 15000 });
          },
        },
        {
          name: 'commit-audit',
          path: () => `/project/${projectId}/commit/${encodeHash(promptTargetHash)}`,
          ready: async (p) => {
            await expect(p.getByText('Commit Audit')).toBeVisible({ timeout: 15000 });
            await expect(p.getByText('assistant_prompt').first()).toBeVisible();
          },
        },
        {
          name: 'leaf-output',
          path: () => `/project/${projectId}/leaf/${leafId}`,
          ready: async (p) => {
            await expect(p.getByText('Output').first()).toBeVisible({ timeout: 15000 });
            await expect(p.getByText('SOURCE YAML').first()).toBeVisible();
          },
        },
        {
          name: 'diff-added-empty-state',
          path: () =>
            `/project/${projectId}/diff?base=${encodeHash(promptBaseHash)}&target=${encodeHash(
              promptTargetHash
            )}`,
          ready: async (p) => {
            await expect(p.getByText('Not present in base')).toBeVisible({ timeout: 15000 });
            await expect(p.getByText('examples').first()).toBeVisible();
          },
        },
        {
          name: 'merge-conflict-workbench',
          path: () => `/project/${projectId}/merge/${mergeId}`,
          ready: async (p) => {
            await expect(p.getByText('Conflicts (2)')).toBeVisible({ timeout: 15000 });
            await expect(
              p.getByRole('button', { name: /(Accept Source|Use source|Use feature)/i }).first()
            ).toBeVisible();
          },
        },
      ];

      for (const route of routes) {
        await test.step(route.name, async () => {
          await assertHealthyRoute(page, route, errors, testInfo, theme);
        });
      }
    });
  }
});
