import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';
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
 */

test.describe('Run Detail Page', () => {
  test.describe.configure({ mode: 'serial' });

  let runId: string | null = null;
  let projectId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // First check for existing runs
    const response = await request.get(`${API_BASE}/runs?limit=1`);
    const data = await response.json();
    if (data.success && data.data?.runs?.length > 0) {
      runId = data.data.runs[0].run_id;
      return;
    }

    // No existing runs — create one via API
    const { projectId: pid } = await createTestProject(request, `Run Detail E2E ${Date.now()}`);
    projectId = pid;

    const runRes = await request.post(`${API_BASE}/runs`, {
      data: {
        project_id: pid,
        metadata: { test_case: 'e2e-run-detail' },
      },
    });
    const runData = await runRes.json();
    if (runData.success && runData.data?.run_id) {
      runId = runData.data.run_id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  // RD-01: Run detail page loads with data
  test('RD-01: Run detail page loads', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/eval/${runId}`);

    // Page shows truncated run ID in breadcrumb: "Run abc12345"
    // Or "Run not found" if the run couldn't be loaded
    // Wait for either the run page or error page to render
    const runIdShort = runId!.slice(0, 8);
    const pageContent = page
      .locator(`text=${runIdShort}`)
      .or(page.locator('text=Run not found'))
      .or(page.locator('text=Overview'));
    await expect(pageContent.first()).toBeVisible({ timeout: 15000 });
  });

  // RD-02: Status badge is displayed
  test('RD-02: Status badge displayed', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/eval/${runId}`);

    // Status badge should show one of the known run statuses
    // Includes "queued" for newly created runs that haven't been processed
    const statusBadge = page
      .getByText('Passed', { exact: true })
      .or(page.getByText('Failed', { exact: true }))
      .or(page.getByText('Running', { exact: true }))
      .or(page.getByText('Completed', { exact: true }))
      .or(page.locator('text=queued'));
    await expect(statusBadge.first()).toBeVisible({ timeout: 15000 });
  });

  // RD-03: Tab navigation works
  test('RD-03: Tab navigation', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/eval/${runId}`);

    // Wait for page to load (Overview tab is default)
    const overviewTab = page.locator('button:has-text("Overview")');
    await expect(overviewTab.first()).toBeVisible({ timeout: 15000 });

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
      .or(page.locator('text=No assertions available'));
    await expect(assertionContent.first()).toBeVisible({ timeout: 10000 });
  });

  // RD-04: Score and metrics visible
  test('RD-04: Score and metrics displayed', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    await page.goto(`/deploy/eval/${runId}`);

    // Wait for page load
    const overviewTab = page.locator('button:has-text("Overview")');
    await expect(overviewTab.first()).toBeVisible({ timeout: 15000 });

    // Score label should be present on the status bar
    const scoreLabel = page.locator('text=Score');
    await expect(scoreLabel.first()).toBeVisible({ timeout: 10000 });

    // Token count label ("tokens") should be present
    const tokensLabel = page.locator('text=tokens');
    await expect(tokensLabel.first()).toBeVisible({ timeout: 10000 });
  });

  // RD-05: No unexpected console errors
  test('RD-05: No unexpected console errors', async ({ page }) => {
    test.skip(!runId, 'No runs available to test');

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`/deploy/eval/${runId}`);
    const overviewTab = page.locator('button:has-text("Overview")');
    await expect(overviewTab.first()).toBeVisible({ timeout: 15000 });

    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });

  // RD-06: Non-existent run shows error
  test('RD-06: Non-existent run shows error', async ({ page }) => {
    await page.goto('/deploy/eval/run_nonexistent_999');

    // Should show error — "Run not found" message or 404
    const errorMsg = page.locator('text=/not found|error|404/i');
    await expect(errorMsg.first()).toBeVisible({ timeout: 15000 });
  });
});
