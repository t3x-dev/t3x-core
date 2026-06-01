import type { Route } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestProject,
  createTestTurn,
} from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

/**
 * Commit-lock flow e2e — tests that once a conversation is committed the UI
 * enters read-only mode.
 *
 * Architecture:
 *   - workspaceStore.isCommitted controls read-only state
 *   - AfterPanel: commit button visible when !isCommitted, hidden once committed
 *   - ChatHeader: extract-button only rendered when panelExpanded && !isCommitted
 *
 * LOCK-01: Happy-path commit
 *   Requires the real commit API endpoint and a running API server.
 *   If the commit API is unavailable in this test environment, the test will
 *   trigger the commit dialog but mock the commit endpoint so we can verify
 *   the post-commit UI state without a live DB.
 *
 * LOCK-02: Pre-commit editable state
 *   Verifies the control baseline before LOCK-01 commits the conversation.
 *
 * LOCK-03: Refresh preserves lock (localStorage / server state)
 *   Skipped — LOCK-01 mocks the commit endpoint, so the server-side
 *   conversation committed_at value is not persisted for a reload assertion.
 *   API and query-level tests cover committed_at hydration separately.
 */

const EXTRACT_URL = '**/api/v1/extract-yops';
const COMMITS_URL = '**/api/v1/commits';

const USER_CONTENT = 'Commit lock test: trip to Berlin with a budget of five thousand euros.';

function validOps(turnHash: string) {
  return [
    {
      define: { path: 'trip' },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: turnHash, quote: 'trip to Berlin' },
      },
    },
    {
      populate: { path: 'trip', values: { destination: 'Berlin', budget: 'five thousand euros' } },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:01Z',
        turn_ref: { turn_hash: turnHash, quote: 'five thousand euros' },
      },
    },
  ];
}

async function expandWorkspaceIfCollapsed(page: import('@playwright/test').Page): Promise<void> {
  const collapsed = page.getByTestId('yops-panel-collapsed');
  if (await collapsed.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await collapsed.click();
  }
}

/**
 * Click Extract. The workspace may start collapsed on chat routes.
 * If the first click races the activeProjectId backfill, retry once.
 */
async function openPanelAndClickExtract(page: import('@playwright/test').Page): Promise<void> {
  await expandWorkspaceIfCollapsed(page);
  const extractBtn = page.getByTestId('extract-button');
  await extractBtn.waitFor({ state: 'visible' });
  const waitForExtract = page.waitForRequest(
    (req) => req.url().includes('/api/v1/extract-yops') && req.method() === 'POST',
    { timeout: 5_000 }
  );
  await extractBtn.click();
  try {
    await waitForExtract;
  } catch {
    await extractBtn.click();
    await page.waitForRequest(
      (req) => req.url().includes('/api/v1/extract-yops') && req.method() === 'POST',
      { timeout: 10_000 }
    );
  }
}

async function applyDraftIfPresent(page: import('@playwright/test').Page): Promise<void> {
  const applyButton = page.getByTestId('workspace-action-apply_changes');
  if (await applyButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await applyButton.click();
  }
}

test.describe('Commit-lock flow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;
  let userTurnHash: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Commit Lock E2E ${Date.now()}`));
    conversationId = await createTestConversation(request, projectId, 'E2E Commit Lock');
    userTurnHash = await createTestTurn(request, projectId, conversationId, 'user', USER_CONTENT);
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  // ── LOCK-01: Full commit via mocked API ───────────────────────────────────

  test('LOCK-01: commit via dialog → extract and commit buttons disabled', async ({
    page,
  }) => {
    // Mock extraction
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

    // Mock commit endpoint so we don't need a full DB+API round-trip
    await page.route(COMMITS_URL, async (route: Route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              commit: {
                hash: 'sha256:mock_commit_hash_lock01',
                schema: 't3x/commit',
                parents: [],
                author: { type: 'human', name: 'E2E Tester' },
                committed_at: new Date().toISOString(),
                content: { trees: [], relations: [] },
                project_id: projectId,
                message: 'E2E commit',
                branch: 'main',
              },
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 15_000 });
    await applyDraftIfPresent(page);

    // Open commit dialog
    const commitBtn = page.getByTestId('workspace-action-commit');
    await expect(commitBtn).toBeEnabled({ timeout: 5_000 });
    await commitBtn.click();

    // Commit dialog should appear
    await expect(page.getByTestId('commit-dialog')).toBeVisible({ timeout: 3_000 });

    // Confirm commit
    await page.getByTestId('commit-dialog-confirm').click();

    // After commit: the header keeps Extract visible for layout stability but disables it.
    await expect(page.getByTestId('extract-button')).toBeDisabled({ timeout: 5_000 });

    // Commit action remains in the action bar for layout stability, but is locked.
    await expect(page.getByTestId('workspace-action-commit')).toBeDisabled({ timeout: 3_000 });
  });

  // ── LOCK-02: Pre-commit editable baseline ─────────────────────────────────

  test('LOCK-02: pre-commit state keeps extract and commit actions enabled', async ({ page }) => {
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

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract to get the panel expanded with content
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 15_000 });
    await applyDraftIfPresent(page);

    // Extract button should be visible now (panelExpanded && !isCommitted)
    await expect(page.getByTestId('extract-button')).toBeVisible({ timeout: 3_000 });

    // LOCK-01 covers the post-commit locked state. This test keeps the
    // pre-commit baseline explicit so regressions do not hide behind LOCK-01.
    await expect(page.getByTestId('extract-button')).toBeVisible();
    await expect(page.getByTestId('workspace-action-commit')).toBeEnabled();
  });

  // ── LOCK-03: Refresh lock persistence ─────────────────────────────────────

  test.skip(
    'LOCK-03: refresh after commit → lock state persists across reload',
    async ({ page: _page }) => {
      // Requires a real server-side commit, not the mocked commit endpoint
      // used in LOCK-01. Conversation committed_at hydration is covered by
      // API and query-level tests.
    }
  );
});
