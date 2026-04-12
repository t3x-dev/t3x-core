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

/** Mock yops-log append to succeed with a fake entry (gold edits call this URL). */
function mockYopsAppend(page: import('@playwright/test').Page) {
  return page.route(YOPS_LOG_URL, async (route: Route) => {
    if (route.request().method() === 'POST') {
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
    } else {
      await route.continue();
    }
  });
}

/** Open the YOps panel (if collapsed) then click Extract. */
async function openPanelAndClickExtract(page: import('@playwright/test').Page): Promise<void> {
  const collapsed = page.getByTestId('yops-panel-collapsed');
  if (await collapsed.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await collapsed.click();
  }
  await page.getByTestId('extract-button').click();
}

test.describe('Gold-edit flow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;
  let userTurnHash: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Gold Edit E2E ${Date.now()}`));
    conversationId = await createTestConversation(request, projectId, 'E2E Gold Edit');
    userTurnHash = await createTestTurn(request, projectId, conversationId, 'user', USER_CONTENT);
  });

  test.afterAll(async ({ request }) => {
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
        body: JSON.stringify({ ops: validOps(userTurnHash) }),
      });
    });

    // Track gold-edit append calls
    const goldAppendCalls: { body: unknown }[] = [];
    await page.route(YOPS_LOG_URL, async (route: Route) => {
      if (route.request().method() === 'POST') {
        try {
          const body = route.request().postDataJSON();
          goldAppendCalls.push({ body });
        } catch {
          // ignore parse errors in body inspection
        }
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
      } else {
        await route.continue();
      }
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

    // Inspect the ops payload: it should contain an 'unset' op with source.type === 'human'
    const lastCall = goldAppendCalls[goldAppendCalls.length - 1];
    const callBody = lastCall.body as { ops?: Array<{ source?: { type?: string } }> };
    const ops = callBody?.ops ?? [];
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
        body: JSON.stringify({ ops: validOps(userTurnHash) }),
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
