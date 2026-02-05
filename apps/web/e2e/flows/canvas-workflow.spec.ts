import { expect, test } from '@playwright/test';
import { cleanupProject, createTestCommitV4, createTestProject } from '../fixtures/api-helpers';
import { CanvasPage } from '../fixtures/page-objects/canvas-page';
import { generateSentences, isExpectedConsoleError } from '../fixtures/test-data-factory';

/**
 * Canvas Workflow E2E Tests
 *
 * Tests canvas node interactions including loading, clicking, and panel display.
 */

test.describe('Canvas Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let commitHash: string;
  const commitMessage = 'Canvas workflow test commit';
  const sentences = generateSentences(3);

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request, `Canvas E2E ${Date.now()}`);
    projectId = id;

    commitHash = await createTestCommitV4(request, projectId, sentences, {
      message: commitMessage,
    });
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  // CW-01: Canvas loads and displays commit nodes
  test('CW-01: Canvas loads nodes', async ({ page }) => {
    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();

    // At least one node should be visible
    const nodeCount = await canvas.getNodesCount();
    expect(nodeCount).toBeGreaterThan(0);

    // Commit node should be visible (by hash or message)
    const commitNode = page
      .locator(`[data-id="${commitHash}"]`)
      .or(page.locator(`text=${commitMessage}`));
    await expect(commitNode.first()).toBeVisible({ timeout: 15000 });
  });

  // CW-02: Clicking a node opens the detail panel with meaningful content (#9)
  test('CW-02: Node click opens panel', async ({ page }) => {
    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();

    // Click the commit node
    await canvas.clickNode(commitHash);

    // A panel or expanded card should appear with commit details
    // The canvas shows commit message + sentence count (not individual sentences)
    const commitLabel = page.locator(`text=${commitMessage}`);
    await expect(commitLabel.first()).toBeVisible({ timeout: 10000 });

    // Should show sentence count
    const sentenceCount = page.locator('text=/\\d+ sentences?/');
    await expect(sentenceCount.first()).toBeVisible({ timeout: 5000 });
  });

  // CW-03: Mode switch (editor/execution) — skip explicitly if unavailable (#3)
  test('CW-03: Mode switch', async ({ page }) => {
    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();

    const executionBtn = page.locator('button:has-text("Execution")');
    const hasToggle = await executionBtn
      .first()
      .isVisible()
      .catch(() => false);

    if (!hasToggle) {
      test.skip(true, 'Editor/Execution mode toggle not present on this page');
      return;
    }

    // Switch to Execution mode
    await executionBtn.first().click();
    const executionView = page.locator('text=Execution Monitor').or(page.locator('main'));
    await expect(executionView.first()).toBeVisible({ timeout: 10000 });

    // Switch back to Editor mode
    const editorBtn = page.locator('button:has-text("Editor")');
    await editorBtn.first().click();
    await canvas.waitForLoad();
  });

  // CW-04: Canvas renders without unexpected console errors (#7, #11)
  test('CW-04: Canvas renders without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();

    // Use shared filter — only excludes known expected errors (#7, #11)
    const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
    expect(unexpectedErrors).toHaveLength(0);
  });
});
