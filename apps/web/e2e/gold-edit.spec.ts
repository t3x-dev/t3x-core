import type { Route } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestProject,
  createTestTurn,
} from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

/**
 * Gold-edit flow e2e — tests human editing of extracted YAML.
 *
 * Covers:
 *  GOLD-01: Delete a slot  → slot removed from AfterPanel → gold op persists
 *           (yops log has a new entry with source.type === 'human')
 *  GOLD-02: Add child node → window.prompt response → new node renders
 *
 * Both tests use page.route() to mock the extract-yops LLM call and
 * page.route() to mock the yops-log append endpoint so gold edits
 * succeed without a live API server.
 *
 * The tests rely on testids added to AfterPanel:
 *   data-testid="slot-row-{nodePath}-{slotKey}"  on each SlotRow wrapper
 *   data-testid="slot-delete"                    on the delete-slot button
 *   data-testid="add-child-button"               on the add-child button
 *   data-testid="after-panel"                    on the AfterPanel root
 */

const EXTRACT_URL = '**/api/v1/extract-yops';
const YOPS_LOG_URL = '**/api/v1/conversations/*/yops';

const USER_CONTENT = 'I want to go to Paris with a budget of ten thousand dollars.';

function validOps(turnHash: string) {
  return [
    {
      define: { path: 'trip' },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:00Z',
        turn_ref: { turn_hash: turnHash, quote: 'budget of ten thousand' },
      },
    },
    {
      populate: { path: 'trip', values: { budget: 'ten thousand dollars', destination: 'Paris' } },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:01Z',
        turn_ref: { turn_hash: turnHash, quote: 'ten thousand dollars' },
      },
    },
  ];
}

/**
 * Mock yops-log append only for human-sourced (gold edit) rows. Extraction
 * commits (all ops source.type === 'llm') pass through to the real API so
 * subsequent hydrate re-reads populate the workspace tree.
 */
function mockYopsAppend(page: import('@playwright/test').Page) {
  return page.route(YOPS_LOG_URL, async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    let body: { yops?: Array<{ source?: { type?: string } }> } | null = null;
    try {
      body = route.request().postDataJSON();
    } catch {
      // let unparseable bodies flow through
    }
    const hasHumanOp = (body?.yops ?? []).some((o) => o?.source?.type === 'human');
    if (!hasHumanOp) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          yops_log_id: 'ylog_mock001',
          conversation_id: 'conv_mock',
          ops: [],
          source: 'manual',
          created_at: new Date().toISOString(),
        },
      }),
    });
  });
}

async function expandWorkspaceIfCollapsed(page: import('@playwright/test').Page): Promise<void> {
  const collapsed = page.getByTestId('yops-panel-collapsed');
  if (await collapsed.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await collapsed.click();
  }
}

/**
 * Click Extract. The workspace may start collapsed on chat routes.
 *
 * `useExtraction.handleExtract` requires `activeProjectId` in the chat store,
 * which is backfilled asynchronously from `GET /conversations/:id` when the
 * URL doesn't carry a projectId (our /chat/<id> routes don't). We wait for
 * that POST to /extract-yops to land; if the first click fires before the
 * backfill completes, we retry once.
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
    // Backfill of activeProjectId hadn't completed yet; retry once.
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

test.describe('Gold-edit flow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;
  let userTurnHash: string;

  // Each test needs a fresh conversation: extraction persists its LLM ops
  // to the real yops log, so reusing the conversation across tests would
  // replay `define trip` twice and halt with ALREADY_EXISTS before the
  // gold edit runs (B-10, audit 2026-04-15).
  test.beforeEach(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Gold Edit E2E ${Date.now()}`));
    conversationId = await createTestConversation(request, projectId, 'E2E Gold Edit');
    userTurnHash = await createTestTurn(request, projectId, conversationId, 'user', USER_CONTENT);
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  // ── GOLD-01: Delete a slot ─────────────────────────────────────────────────

  test('GOLD-01: delete slot → slot removed from AfterPanel → gold op persisted', async ({
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

    // Track gold-edit append calls. Extraction also POSTs to the same endpoint
    // (runExtraction → commitOps → POST /conversations/:id/yops); let those pass
    // through to the real API so the yops-log hydrates the tree. Only intercept
    // rows that contain a human-sourced op (gold edit). The API body shape is
    // `{ source, yops: SourcedYOp[], metadata? }`.
    const goldAppendCalls: { body: unknown }[] = [];
    await page.route(YOPS_LOG_URL, async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      let body: {
        source?: string;
        yops?: Array<{ source?: { type?: string } }>;
      } | null = null;
      try {
        body = route.request().postDataJSON();
      } catch {
        // leave body null — unparseable bodies forward to the real API
      }
      const hasHumanOp = (body?.yops ?? []).some((o) => o?.source?.type === 'human');
      if (!hasHumanOp) {
        await route.continue();
        return;
      }
      goldAppendCalls.push({ body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            yops_log_id: `ylog_${Date.now()}`,
            conversation_id: conversationId,
            ops: [],
            source: 'manual',
            created_at: new Date().toISOString(),
          },
        }),
      });
    });

    // Inject session user so gold-edit buildHumanSource() finds an author
    await page.addInitScript(() => {
      localStorage.setItem(
        't3x-user',
        JSON.stringify({ id: 'u_test', name: 'E2E Tester', username: 'e2e_tester' })
      );
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 15_000 });
    await expect(page.getByTestId('after-panel')).toContainText('budget', { timeout: 5_000 });
    await applyDraftIfPresent(page);

    // Hover the slot row to reveal the delete button (opacity-0 → group-hover:opacity-100)
    const slotRow = page.getByTestId('slot-row-trip-budget');
    await expect(slotRow).toBeVisible({ timeout: 5_000 });
    await slotRow.hover();

    // Click delete (the button is inside the slot row and becomes visible on hover)
    const deleteBtn = slotRow.getByTestId('slot-delete');
    await deleteBtn.click();

    // Verify the budget slot is gone from AfterPanel
    await expect(page.getByTestId('slot-row-trip-budget')).not.toBeVisible({ timeout: 5_000 });

    // Verify at least one gold-edit write call happened.
    // The full persistence round-trip (appendYOps → createYOpsEntry) fires asynchronously;
    // give it a moment to settle.
    await page.waitForTimeout(500);
    expect(goldAppendCalls.length).toBeGreaterThanOrEqual(1);

    // Inspect the yops payload: it should contain an op with source.type === 'human'
    const lastCall = goldAppendCalls[goldAppendCalls.length - 1];
    const callBody = lastCall.body as { yops?: Array<{ source?: { type?: string } }> };
    const ops = callBody?.yops ?? [];
    const humanOp = ops.find((o) => o?.source?.type === 'human');
    expect(humanOp).toBeDefined();
  });

  // ── GOLD-02: Add child node ────────────────────────────────────────────────

  test('GOLD-02: add child node via prompt → child renders in AfterPanel', async ({ page }) => {
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

    // Mock gold-edit persistence
    await mockYopsAppend(page);

    // Inject session user
    await page.addInitScript(() => {
      localStorage.setItem(
        't3x-user',
        JSON.stringify({ id: 'u_test', name: 'E2E Tester', username: 'e2e_tester' })
      );
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract to populate the tree
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 15_000 });
    await applyDraftIfPresent(page);

    // Hover the 'trip' node header to reveal its action buttons
    // The NodeRow renders a group div with buttons that are opacity-0 group-hover:opacity-100
    const afterPanel = page.getByTestId('after-panel');
    const tripNodeText = afterPanel.getByText('trip:', { exact: false }).first();
    await tripNodeText.hover();

    // Handle the window.prompt dialog for new child name
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('notes');
    });

    // Click the add-child button (first one visible = trip node row)
    const addChildBtn = page.getByTestId('add-child-button').first();
    await addChildBtn.click();

    // Verify the new 'notes' child node appears in the AfterPanel
    await expect(afterPanel).toContainText('notes', { timeout: 5_000 });
  });
});
