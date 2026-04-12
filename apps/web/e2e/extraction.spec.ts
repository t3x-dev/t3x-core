import type { Route } from '@playwright/test';
import {
  cleanupProject,
  createTestConversation,
  createTestProject,
  createTestTurn,
} from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

/**
 * Extraction flow e2e — uses page.route() to mock the extract-yops API
 * endpoint so we don't invoke real LLMs in CI.
 *
 * The worker (extractionWorker.ts) calls callExtractionLLM which fetches
 * http://localhost:8000/api/v1/extract-yops. The mock returns SourcedYOp[]
 * wrapped as { ops: [...] }, matching the shape in llmAdapter.ts.
 *
 * validateSource (in @t3x-dev/core) verifies that each op's turn_ref.quote
 * is a verbatim substring of the actual turn content loaded from the API.
 * Valid ops use a quote drawn from userContent; invalid ops use a phrase
 * not present in the turn.
 */

const EXTRACT_URL = '**/api/v1/extract-yops';

/** Quote taken verbatim from userContent below — validates cleanly. */
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
        },
      },
    },
    {
      populate: { path: 'trip', values: { budget: 'ten thousand dollars' } },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:01Z',
        turn_ref: {
          turn_hash: turnHash,
          quote: 'ten thousand dollars',
        },
      },
    },
  ];
}

/** Quote NOT present in userContent — triggers unverifiable_quote failure. */
function invalidOps(turnHash: string) {
  return [
    {
      set: { path: 'trip/budget', value: 'twenty' },
      source: {
        type: 'llm',
        model: 'mock-model',
        at: '2026-04-12T00:00:00Z',
        turn_ref: {
          turn_hash: turnHash,
          quote: 'PHRASE_NOT_IN_TURN_CONTENT_XYZ',
        },
      },
    },
  ];
}

/** Expand the YOps panel (collapsed by default on first load) then click Extract. */
async function openPanelAndClickExtract(page: import('@playwright/test').Page): Promise<void> {
  const collapsed = page.getByTestId('yops-panel-collapsed');
  if (await collapsed.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await collapsed.click();
  }
  // Extract button is only rendered when panelExpanded && !isCommitted
  await page.getByTestId('extract-button').click();
}

test.describe('Extraction flow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let conversationId: string;
  let userTurnHash: string;
  const userContent = 'I want to go to Paris with a budget of ten thousand dollars.';

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Extraction E2E ${Date.now()}`));
    conversationId = await createTestConversation(request, projectId, 'E2E Extraction');
    userTurnHash = await createTestTurn(request, projectId, conversationId, 'user', userContent);
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  // ── EXT-01: happy path ─────────────────────────────────────────────────────

  test('EXT-01: extract → YAML renders → refresh preserves state', async ({ page }) => {
    let callCount = 0;

    await page.route(EXTRACT_URL, async (route: Route) => {
      callCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ops: validOps(userTurnHash) }),
      });
    });

    await page.goto(`/chat/${conversationId}`);

    // Wait for the conversation turn to load
    await expect(page.getByText(userContent).first()).toBeVisible({ timeout: 10_000 });

    await openPanelAndClickExtract(page);

    // AfterPanel should show the extracted tree key "trip"
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 15_000 });
    expect(callCount).toBeGreaterThanOrEqual(1);

    // ── Persistence: reload and verify state is restored ──
    await page.reload();
    // Re-expand panel if it collapsed on reload
    const collapsed = page.getByTestId('yops-panel-collapsed');
    if (await collapsed.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await collapsed.click();
    }
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 10_000 });
  });

  // ── EXT-02: retry path ─────────────────────────────────────────────────────

  test('EXT-02: invalid ops on first call → valid on second → YAML renders', async ({ page }) => {
    let callCount = 0;

    await page.route(EXTRACT_URL, async (route: Route) => {
      callCount += 1;
      const ops = callCount === 1 ? invalidOps(userTurnHash) : validOps(userTurnHash);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ops }),
      });
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(userContent).first()).toBeVisible({ timeout: 10_000 });

    await openPanelAndClickExtract(page);

    // Worker retried and succeeded — AfterPanel shows the tree
    await expect(page.getByTestId('after-panel')).toContainText('trip', { timeout: 20_000 });
    // At least 2 calls: first invalid, second valid
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  // ── EXT-03: hard fail ──────────────────────────────────────────────────────

  test('EXT-03: three invalid calls → error surfaces', async ({ page }) => {
    let callCount = 0;

    await page.route(EXTRACT_URL, async (route: Route) => {
      callCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ops: invalidOps(userTurnHash) }),
      });
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(userContent).first()).toBeVisible({ timeout: 10_000 });

    await openPanelAndClickExtract(page);

    // The worker exhausts MAX_RETRIES (3 calls) before throwing ExtractionFailedError
    // useExtraction catches it and calls toast.error() via sonner
    await expect(
      page
        .locator('[data-sonner-toast]')
        .or(page.getByTestId('extraction-error'))
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    // Exactly 3 LLM calls (initial + 2 retries)
    expect(callCount).toBe(3);
  });

  // ── EXT-04: network error ─────────────────────────────────────────────────

  test('EXT-04: 500 response → error surfaces on first call', async ({ page }) => {
    let callCount = 0;

    await page.route(EXTRACT_URL, async (route: Route) => {
      callCount += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'boom' },
        }),
      });
    });

    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText(userContent).first()).toBeVisible({ timeout: 10_000 });

    await openPanelAndClickExtract(page);

    // HTTP 500 → callExtractionLLM throws → ExtractionFailedError(reason='llm_error')
    // → toast.error() fires without retry
    await expect(
      page
        .locator('[data-sonner-toast]')
        .or(page.getByTestId('extraction-error'))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    expect(callCount).toBe(1);
  });
});
