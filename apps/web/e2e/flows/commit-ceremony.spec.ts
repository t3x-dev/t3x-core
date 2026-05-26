import type { Page, Route } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestProject,
  createTestTurn,
} from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';

const EXTRACT_URL = '**/api/v1/extract-yops';
const COMMITS_URL = '**/api/v1/commits';
const COMMIT_HASH = 'sha256:1234567890abcdef1234567890abcdef';
const USER_CONTENT = 'Commit ceremony test: the release note must mention a stable hash chain.';

function validOps(turnHash: string) {
  return [
    {
      define: { path: 'release_note' },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-05-20T00:00:00Z',
        turn_ref: { turn_hash: turnHash, quote: 'release note' },
      },
    },
    {
      populate: {
        path: 'release_note',
        values: { requirement: 'Mention a stable hash chain' },
      },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-05-20T00:00:01Z',
        turn_ref: { turn_hash: turnHash, quote: 'stable hash chain' },
      },
    },
  ];
}

async function openPanelAndClickExtract(page: Page): Promise<void> {
  const collapsedWorkspace = page.getByTestId('yops-panel-collapsed');
  if (await collapsedWorkspace.isVisible().catch(() => false)) {
    await collapsedWorkspace.click();
  }

  const extractButton = page.getByTestId('extract-button');
  await extractButton.waitFor({ state: 'visible' });
  const waitForExtract = page.waitForRequest(
    (request) => request.url().includes('/api/v1/extract-yops') && request.method() === 'POST',
    { timeout: 5_000 }
  );
  await extractButton.click();
  try {
    await waitForExtract;
  } catch {
    await extractButton.click();
    await page.waitForRequest(
      (request) => request.url().includes('/api/v1/extract-yops') && request.method() === 'POST',
      { timeout: 10_000 }
    );
  }
}

test.describe('commit ceremony', () => {
  test.describe.configure({ mode: 'serial' });

  for (const theme of ['light', 'dark'] as const) {
    test(`shows a sealed confirmation with the real hash after commit success in ${theme} mode`, async ({
      page,
      request,
    }, testInfo) => {
      const { projectId } = await createTestProject(
        request,
        `Commit Ceremony E2E ${theme} ${Date.now()}`
      );
      const conversationId = await createTestConversation(
        request,
        projectId,
        `E2E Commit Ceremony ${theme}`
      );
      const userTurnHash = await createTestTurn(
        request,
        projectId,
        conversationId,
        'user',
        USER_CONTENT
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      if (theme === 'dark') {
        await page.addInitScript(() => {
          localStorage.setItem('theme', 'dark');
          document.documentElement?.classList.add('dark');
        });
      }

      await page.route(EXTRACT_URL, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { kind: 'ok', ops: validOps(userTurnHash), warnings: [] },
          }),
        });
      });
      await page.route(COMMITS_URL, async (route: Route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              commit: {
                hash: COMMIT_HASH,
                schema: 't3x/commit',
                parents: [],
                author: { type: 'human', name: 'E2E Tester' },
                committed_at: new Date().toISOString(),
                content: { trees: [], relations: [] },
                project_id: projectId,
                message: 'E2E commit ceremony',
                branch: 'main',
              },
            },
          }),
        });
      });

      try {
        await page.goto(`/chat/${conversationId}`);
        await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

        await openPanelAndClickExtract(page);
        await expect(page.getByTestId('after-panel')).toContainText('release_note', {
          timeout: 15_000,
        });
        await page.getByTestId('workspace-action-apply_changes').click();
        await expect(page.getByTestId('after-panel')).toContainText('Output', {
          timeout: 5_000,
        });
        await expect(page.getByTestId('workspace-action-commit')).toBeEnabled({ timeout: 5_000 });
        await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 3_000 });

        await page.getByTestId('workspace-action-commit').click();
        await expect(page.getByTestId('commit-dialog')).toBeVisible({ timeout: 3_000 });
        await page.getByTestId('commit-dialog-confirm').click();

        const ceremony = page.getByRole('status', { name: 'Commit sealed' });
        await expect(ceremony).toBeVisible({ timeout: 1_000 });
        await expect(ceremony).toHaveAttribute('data-motion', 'standard');
        await expect(page.getByTitle(COMMIT_HASH)).toContainText('1234567890ab');
        await testInfo.attach(`commit-ceremony-desktop-${theme}`, {
          body: await page.screenshot({ fullPage: false }),
          contentType: 'image/png',
        });
      } finally {
        await cleanupProject(request, projectId).catch(() => {});
      }
    });
  }
});
