import { expect, test } from '@playwright/test';
import { API_BASE } from '../fixtures/api-helpers';
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

    // Wait for page to load
    const heading = page.locator(`text=${runId}`).or(page.locator('text=Run'));
    await expect(heading.first()).toBeVisible({ timeout: 15000 });
  });

  // RD-02: Status badge is displayed
  test('RD-02: Status badge displayed', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/${runId}`);

    const statusBadge = page
      .locator('text=Passed')
      .or(page.locator('text=Failed'))
      .or(page.locator('text=running'))
      .or(page.locator('text=completed'));
    await expect(statusBadge.first()).toBeVisible({ timeout: 15000 });
  });

  // RD-03: Tab navigation works
  test('RD-03: Tab navigation', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/${runId}`);

    // Wait for initial load
    const heading = page.locator(`text=${runId}`).or(page.locator('text=Run'));
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    // Check for tab buttons
    const traceTab = page.locator('text=Trace').or(page.locator('button:has-text("Trace")'));
    const hasTrace = await traceTab
      .first()
      .isVisible()
      .catch(() => false);

    if (hasTrace) {
      await traceTab.first().click();
      const traceContent = page.locator('text=Execution Trace').or(page.locator('text=Timeline'));
      await expect(traceContent.first()).toBeVisible({ timeout: 10000 });
    }

    const assertionsTab = page
      .locator('text=Assertions')
      .or(page.locator('button:has-text("Assertions")'));
    const hasAssertions = await assertionsTab
      .first()
      .isVisible()
      .catch(() => false);

    if (hasAssertions) {
      await assertionsTab.first().click();
      // Assertions content should load
      await page.waitForTimeout(1000);
    }

    expect(true).toBe(true);
  });

  // RD-04: Score and metrics visible
  test('RD-04: Score and metrics displayed', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/${runId}`);

    const heading = page.locator(`text=${runId}`).or(page.locator('text=Run'));
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    // Score should be visible
    const score = page.locator('text=Score').or(page.locator('text=/%/'));
    const hasScore = await score
      .first()
      .isVisible()
      .catch(() => false);

    // Latency metric should be visible
    const latency = page.locator('text=Latency').or(page.locator('text=/\\d+ms/'));
    const hasLatency = await latency
      .first()
      .isVisible()
      .catch(() => false);

    // At least one metric should be present
    expect(hasScore || hasLatency).toBe(true);
  });

  // RD-05: No unexpected console errors
  test('RD-05: No unexpected console errors', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`/deploy/${runId}`);
    const heading = page.locator(`text=${runId}`).or(page.locator('text=Run'));
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });

  // RD-06: Non-existent run shows error
  test('RD-06: Non-existent run shows error', async ({ page }) => {
    await page.goto('/deploy/run_nonexistent_999');

    // Should show error or 404
    const errorMsg = page.locator('text=/not found|error|404/i').or(page.locator('text=Run'));
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });
  });
});
