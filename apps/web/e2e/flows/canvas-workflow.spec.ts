import { cleanupProject, createTestCommit, createTestProject } from '../fixtures/api-helpers';
import { CanvasPage } from '../fixtures/page-objects/canvas-page';
import { expect, test } from '../fixtures/test';
import { generateNodes, isExpectedConsoleError } from '../fixtures/test-data-factory';

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
  const nodes = generateNodes(3);

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request, `Canvas E2E ${Date.now()}`);
    projectId = id;

    commitHash = await createTestCommit(request, projectId, nodes, {
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

  // CW-02: Clicking a commit selects it without reviving the retired details modal.
  test('CW-02: Node click selects the version on Canvas', async ({ page }) => {
    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();

    // Click the commit node
    await canvas.clickNode(commitHash);

    await expect(page.getByText('SELECTION', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Available Actions', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
    await expect(page.getByText('V4 Architecture', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // CW-03: Current canvas toolbar remains interactive after fitting the graph.
  test('CW-03: Fit View keeps the commit graph operational', async ({ page }) => {
    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();

    const fitView = page.locator('[title="Fit View"]:visible').first();
    await expect(fitView).toBeVisible();
    await fitView.click();

    await expect(canvas.canvas).toBeVisible();
    await expect(canvas.getNodeByHash(commitHash).first()).toBeVisible();
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
