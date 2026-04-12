import type { Route } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestProject,
  createTestTurn,
} from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

/**
 * Click-highlight e2e — verifies the YAML ↔ chat bidirectional highlight flow.
 *
 * Spec (from commit-source-context-presentation.md):
 *   - Clicking a slot row in AfterPanel calls workspaceStore.select('after', { nodePath, slotKey })
 *   - ChatMessage.SourceMappedText re-renders with isActive=true on matching spans
 *   - Active spans receive data-source-highlight="active" (added in this task)
 *   - Clicking elsewhere clears the selection → spans revert to data-source-highlight="default"
 *   - Hovering a slot (without clicking) does NOT activate highlights (click-only model)
 *
 * Implementation note:
 *   Source mappings are built from the opsLog + turns in workspaceStore after extraction.
 *   The SourceMappedText renders when `hasActiveSelection && hasSourceMappings` — so we
 *   need a selection to be active AND source maps to exist.
 *
 *   The highlight activation path is:
 *     1. User clicks slot row in AfterPanel
 *     2. workspaceStore.select() sets selectedNodePath + selectedSlotKey
 *     3. ChatMessage computes hoveredNodeId from store → isSourceMessage = true
 *     4. useSourceMappedSpans = true → SourceMappedText renders spans with data-source-highlight
 *
 *   The spans with data-source-highlight="active" are the matching spans.
 *   Since the extraction worker builds sourceIndex from verbatim quotes in ops,
 *   and our mock ops carry turn_ref.quote, we expect the quote text to be highlighted
 *   once the slot is selected.
 */

const EXTRACT_URL = '**/api/v1/extract-yops';
const USER_CONTENT = 'I want to go to Paris with a budget of ten thousand dollars.';
const QUOTE = 'ten thousand dollars';

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
      populate: { path: 'trip', values: { budget: 'ten thousand dollars' } },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:01Z',
        turn_ref: { turn_hash: turnHash, quote: QUOTE },
      },
    },
  ];
}

/** Open the YOps panel (if collapsed) then click Extract. */
async function openPanelAndClickExtract(page: import('@playwright/test').Page): Promise<void> {
  const collapsed = page.getByTestId('yops-panel-collapsed');
  if (await collapsed.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await collapsed.click();
  }
  await page.getByTestId('extract-button').click();
}

test.describe('Click-highlight flow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;
  let userTurnHash: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Click Highlight E2E ${Date.now()}`));
    conversationId = await createTestConversation(request, projectId, 'E2E Click Highlight');
    userTurnHash = await createTestTurn(request, projectId, conversationId, 'user', USER_CONTENT);
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  // ── CLICK-01: click slot → chat span activates ────────────────────────────

  test('CLICK-01: click slot in AfterPanel → matching chat span activates (purple)', async ({
    page,
  }) => {
    await page.route(EXTRACT_URL, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ops: validOps(userTurnHash) }),
      });
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract to populate the AfterPanel and sourceIndex
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 15_000 });
    await expect(page.getByTestId('after-panel')).toContainText('budget', { timeout: 5_000 });

    // Click the slot row for trip/budget — this calls workspaceStore.select()
    const slotRow = page.getByTestId('slot-row-trip-budget');
    await expect(slotRow).toBeVisible({ timeout: 5_000 });
    await slotRow.click();

    // After clicking, the chat should render source-mapped spans.
    // The span containing QUOTE should become active.
    // data-source-highlight="active" is set when hoveredNodeId matches m.treePath.
    const activeSpan = page.locator('[data-source-highlight="active"]').first();
    await expect(activeSpan).toBeVisible({ timeout: 5_000 });
    // The active span text should overlap with (or equal) the quoted phrase
    const spanText = await activeSpan.textContent();
    expect(spanText?.toLowerCase()).toContain(QUOTE.split(' ')[0]); // e.g. "ten"
  });

  // ── CLICK-02: click elsewhere → highlight clears ─────────────────────────

  test('CLICK-02: click elsewhere → active highlight clears', async ({ page }) => {
    await page.route(EXTRACT_URL, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ops: validOps(userTurnHash) }),
      });
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('budget', { timeout: 15_000 });

    // Click slot to activate
    await page.getByTestId('slot-row-trip-budget').click();
    await expect(page.locator('[data-source-highlight="active"]').first()).toBeVisible({
      timeout: 5_000,
    });

    // Click on an empty area of the AfterPanel header (not a slot)
    // The header "Result" label has no click handler → workspaceStore.clearSelection() fires
    // when clicking the slot row again (toggle) or clicking outside
    await page.getByTestId('slot-row-trip-budget').click(); // second click = toggle/clear

    // Active highlights should be gone
    await expect(page.locator('[data-source-highlight="active"]')).toHaveCount(0, {
      timeout: 3_000,
    });
  });

  // ── CLICK-03: hover (no click) → no highlight ────────────────────────────

  test('CLICK-03: hover slot without clicking → NO active highlight (click-only model)', async ({
    page,
  }) => {
    await page.route(EXTRACT_URL, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ops: validOps(userTurnHash) }),
      });
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('budget', { timeout: 15_000 });

    // Hover the slot row (no click) — should NOT produce an active highlight
    await page.getByTestId('slot-row-trip-budget').hover();
    // Wait briefly to confirm no highlights appear
    await page.waitForTimeout(400);

    // No active highlight spans should exist
    await expect(page.locator('[data-source-highlight="active"]')).toHaveCount(0);
  });
});
