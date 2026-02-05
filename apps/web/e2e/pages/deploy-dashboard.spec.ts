import { expect, test } from '@playwright/test';
import { cleanupDeployAgent, createTestDeployAgent } from '../fixtures/api-helpers';
import { DeployPage } from '../fixtures/page-objects/deploy-page';
import { isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Deploy Dashboard E2E Tests
 *
 * Tests the deploy agents management page including:
 * - Page load and agent display
 * - Add deploy agent form
 * - Delete deploy agent
 * - Runs table display
 * - Model filter
 * - Runner offline state
 */

test.describe('Deploy Dashboard', () => {
  const agentIdsToCleanup: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of agentIdsToCleanup) {
      await cleanupDeployAgent(request, id).catch(() => {});
    }
  });

  // DD-01: Deploy page loads with agents displayed
  test('DD-01: Page loads with agents', async ({ page, request }) => {
    const agentId = `e2e-dd01-${Date.now()}`;
    await createTestDeployAgent(request, agentId, 'DD-01 Agent', 'http://localhost:9999');
    agentIdsToCleanup.push(agentId);

    const deploy = new DeployPage(page);
    await deploy.goto();
    await deploy.waitForLoad();

    // Deploy Agents heading should be visible
    const heading = page.locator('text=Deploy Agents');
    await expect(heading.first()).toBeVisible({ timeout: 10000 });

    // Agent should appear on the page
    const agentName = page.locator('text=DD-01 Agent');
    await expect(agentName.first()).toBeVisible({ timeout: 10000 });
  });

  // DD-02: Add deploy agent via form
  test('DD-02: Add deploy agent', async ({ page }) => {
    const deploy = new DeployPage(page);
    await deploy.goto();
    await deploy.waitForLoad();

    const agentId = `e2e-dd02-${Date.now()}`;
    agentIdsToCleanup.push(agentId);

    await deploy.openAddAgentForm();

    await deploy.fillAddAgentForm(agentId, 'DD-02 Agent', 'http://localhost:9998');
    await deploy.submitAddAgent();

    // New agent should appear
    const agentName = page.locator('text=DD-02 Agent');
    await expect(agentName.first()).toBeVisible({ timeout: 10000 });
  });

  // DD-03: Delete deploy agent
  test('DD-03: Delete deploy agent', async ({ page, request }) => {
    const agentId = `e2e-dd03-${Date.now()}`;
    await createTestDeployAgent(request, agentId, 'DD-03 Delete Me', 'http://localhost:9997');

    const deploy = new DeployPage(page);
    await deploy.goto();
    await deploy.waitForLoad();

    // Agent should be visible
    const agentText = page.locator('text=DD-03 Delete Me');
    await expect(agentText.first()).toBeVisible({ timeout: 10000 });

    // Delete the agent
    await deploy.deleteAgent('DD-03 Delete Me');

    // Agent should disappear (may need to wait for confirmation dialog)
    await expect(async () => {
      const stillVisible = await agentText
        .first()
        .isVisible()
        .catch(() => false);
      expect(stillVisible).toBe(false);
    }).toPass({ timeout: 10000 });
  });

  // DD-04: Runs table displays rows
  test('DD-04: Runs table displayed', async ({ page }) => {
    const deploy = new DeployPage(page);
    await deploy.goto();
    await deploy.waitForLoad();

    // Look for a dedicated Recent Runs heading (not just the word "Runs")
    const runsHeading = page.locator('text=Recent Runs').first();
    const hasRunsSection = await runsHeading.isVisible().catch(() => false);
    test.skip(!hasRunsSection, 'Recent Runs section not present — no runs data');

    // Runs heading found — table should exist below it
    const runsTable = page.locator('table').first();
    await expect(runsTable).toBeVisible({ timeout: 5000 });
  });

  // DD-05: Model filter exists
  test('DD-05: Model filter available', async ({ page }) => {
    const deploy = new DeployPage(page);
    await deploy.goto();
    await deploy.waitForLoad();

    const hasFilter = await deploy.hasModelFilter();
    test.skip(!hasFilter, 'Model filter not present — no runs data to filter');

    const filterElement = page.locator('text=All Models').first();
    await expect(filterElement).toBeVisible({ timeout: 5000 });
  });

  // DD-06: Runner offline state shows warning
  test('DD-06: Runner offline warning', async ({ page }) => {
    const deploy = new DeployPage(page);
    await deploy.goto();
    await deploy.waitForLoad();

    const isOffline = await deploy.isRunnerOffline();
    if (isOffline) {
      const warning = page.locator('text=Runner service is not connected');
      await expect(warning).toBeVisible({ timeout: 5000 });
    } else {
      // Runner is online — warning should NOT be shown
      const warning = page.locator('text=Runner service is not connected');
      const hasWarning = await warning.isVisible().catch(() => false);
      expect(hasWarning).toBe(false);
    }
  });

  // DD-07: Page renders without unexpected errors
  test('DD-07: No unexpected console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const deploy = new DeployPage(page);
    await deploy.goto();
    await deploy.waitForLoad();

    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });
});
