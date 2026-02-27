import { API_BASE } from '../fixtures/api-helpers';
import { expect, test } from '../fixtures/test';
import { isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Deploy Run Detail Page E2E Tests
 *
 * Tests the individual run detail page including:
 * - Page load with run data
 * - Status badge display
 * - Tab navigation (Overview, Trace, Assertions)
 * - Score and metrics display
 *
 * Note: These tests depend on existing run data. If no runs exist,
 * tests will skip gracefully.
 */

test.describe('Run Detail Page', () => {
  let runId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Fetch an existing run to test with
    const response = await request.get(`${API_BASE}/runs?limit=1`);
    const data = await response.json();
    if (data.success && data.data?.runs?.length > 0) {
      runId = data.data.runs[0].run_id;
    }
  });

  // RD-01: Run detail page loads with data
  test('RD-01: Run detail page loads', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/${runId}`);

    // Run ID should be displayed on the page
    const heading = page.locator(`text=${runId}`);
    await expect(heading.first()).toBeVisible({ timeout: 15000 });
  });

  // RD-02: Status badge is displayed
  test('RD-02: Status badge displayed', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/${runId}`);

    // Status badge should show one of the known run statuses (exact match)
    const statusBadge = page
      .getByText('Passed', { exact: true })
      .or(page.getByText('Failed', { exact: true }))
      .or(page.getByText('Running', { exact: true }))
      .or(page.getByText('Completed', { exact: true }));
    await expect(statusBadge.first()).toBeVisible({ timeout: 15000 });
  });

  // RD-03: Tab navigation works
  test('RD-03: Tab navigation', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/${runId}`);

    // Wait for initial load
    const heading = page.locator(`text=${runId}`);
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    // Trace tab should exist and show content when clicked
    const traceTab = page.locator('button:has-text("Trace")');
    await expect(traceTab.first()).toBeVisible({ timeout: 10000 });
    await traceTab.first().click();
    const traceContent = page.locator('text=Execution Trace');
    await expect(traceContent.first()).toBeVisible({ timeout: 10000 });

    // Assertions tab should exist and show content when clicked
    const assertionsTab = page.locator('button:has-text("Assertions")');
    await expect(assertionsTab.first()).toBeVisible({ timeout: 10000 });
    await assertionsTab.first().click();
    const assertionContent = page
      .locator('text=Assertion')
      .or(page.locator('[class*="assertion"]'));
    await expect(assertionContent.first()).toBeVisible({ timeout: 10000 });
  });

  // RD-04: Score and metrics visible
  test('RD-04: Score and metrics displayed', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/${runId}`);

    const heading = page.locator(`text=${runId}`);
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    // Both Score and Latency metrics should be present on a run detail page
    const scoreLabel = page.locator('text=Score');
    await expect(scoreLabel.first()).toBeVisible({ timeout: 10000 });

    const latencyLabel = page.locator('text=Latency');
    await expect(latencyLabel.first()).toBeVisible({ timeout: 10000 });
  });

  // RD-05: No unexpected console errors
  test('RD-05: No unexpected console errors', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`/deploy/${runId}`);
    const heading = page.locator(`text=${runId}`);
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });

  // RD-06: Non-existent run shows error
  test('RD-06: Non-existent run shows error', async ({ page }) => {
    await page.goto('/deploy/run_nonexistent_999');

    // Should show error or 404 — not a generic page
    const errorMsg = page.locator('text=/not found|error|404/i');
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });
  });
});
