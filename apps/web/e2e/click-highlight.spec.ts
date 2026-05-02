import type { Route } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestProject,
  createTestTurn,
} from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

/**
 * Click-highlight e2e — verifies the YAML → chat highlight flow.
 *
 * Current behaviour (ChatMessage.tsx:445-451 rendering priority):
 *   - Clicking a slot row in AfterPanel calls workspaceStore.select('after', { nodePath, slotKey })
 *   - ChatMessage resolves hoveredNodeId → populates highlightRanges from the sourceIndex quote
 *   - `useYamlHighlights` wins over `useSourceMappedSpans` when a matching quote exists
 *   - The quoted phrase is wrapped in a <mark> via HighlightedText
 *   - Clicking the slot again clears the selection → <mark> unmounts
 *   - Hovering a slot (without clicking) does NOT activate highlights (click-only model)
 *
 * Mock ops include start_char/end_char so buildSourceMap has valid positions even if the
 * test ever needs to exercise the source-mapped-span branch (currently shadowed by YAML
 * highlights for this scenario).
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
        turn_ref: {
          turn_hash: turnHash,
          quote: 'budget of ten thousand',
          start_char: 29,
          end_char: 51,
        },
      },
    },
    {
      populate: { path: 'trip', values: { budget: 'ten thousand dollars' } },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:01Z',
        turn_ref: { turn_hash: turnHash, quote: QUOTE, start_char: 39, end_char: 59 },
      },
    },
  ];
}

/**
 * Click Extract. The panel auto-expands via useChatInit after hydration.
 * If the first click races the activeProjectId backfill, retry once.
 */
async function openPanelAndClickExtract(page: import('@playwright/test').Page): Promise<void> {
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
        body: JSON.stringify({
          success: true,
          data: { kind: 'ok', ops: validOps(userTurnHash), warnings: [] },
        }),
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

    // After clicking, YAML→chat highlights render: the quoted phrase in the user turn
    // is wrapped in a <mark> (HighlightedText) — this shadows the source-mapped span
    // branch for this case (see ChatMessage.tsx:445-451 priority).
    const activeMark = page.locator('mark', { hasText: QUOTE.split(' ')[0] }).first();
    await expect(activeMark).toBeVisible({ timeout: 5_000 });
    const markText = await activeMark.textContent();
    expect(markText?.toLowerCase()).toContain(QUOTE.split(' ')[0]); // e.g. "ten"
  });

  // ── CLICK-02: click elsewhere → highlight clears ─────────────────────────

  test('CLICK-02: click elsewhere → active highlight clears', async ({ page }) => {
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

    // Extract
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('budget', { timeout: 15_000 });

    // Click slot to activate
    await page.getByTestId('slot-row-trip-budget').click();
    await expect(page.locator('mark', { hasText: QUOTE.split(' ')[0] }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Second click on the slot row toggles/clears the selection
    await page.getByTestId('slot-row-trip-budget').click();

    // Chat highlight <mark>s should be gone
    await expect(page.locator('mark', { hasText: QUOTE.split(' ')[0] })).toHaveCount(0, {
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
        body: JSON.stringify({
          success: true,
          data: { kind: 'ok', ops: validOps(userTurnHash), warnings: [] },
        }),
      });
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(USER_CONTENT).first()).toBeVisible({ timeout: 10_000 });

    // Extract
    await openPanelAndClickExtract(page);
    await expect(page.getByTestId('after-panel')).toContainText('budget', { timeout: 15_000 });

    // Hover the slot row (no click) — should NOT produce a chat highlight
    await page.getByTestId('slot-row-trip-budget').hover();
    // Wait briefly to confirm no highlights appear
    await page.waitForTimeout(400);

    // No <mark> highlights should exist in chat for the quoted phrase
    await expect(page.locator('mark', { hasText: QUOTE.split(' ')[0] })).toHaveCount(0);
  });
});
