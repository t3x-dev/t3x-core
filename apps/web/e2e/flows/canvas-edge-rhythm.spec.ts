import {
  cleanupProject,
  createTestBranch,
  createTestCommit,
  createTestProject,
} from '../fixtures/api-helpers';
import { CanvasPage } from '../fixtures/page-objects/canvas-page';
import { expect, test } from '../fixtures/test';
import { generateNodes } from '../fixtures/test-data-factory';

test.describe('Canvas edge rhythm', () => {
  let projectId: string;
  let featureCommitHash: string;
  const featureBranch = `edge-rhythm-${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Canvas Edge Rhythm ${Date.now()}`));
    await createTestBranch(request, projectId, 'main').catch(() => {});
    const baseHash = await createTestCommit(request, projectId, generateNodes(2), {
      branch: 'main',
      message: 'Edge rhythm base',
    });
    await createTestCommit(request, projectId, generateNodes(2), {
      branch: 'main',
      message: 'Edge rhythm main child',
      parents: [baseHash],
    });
    await createTestBranch(request, projectId, featureBranch, { parentBranch: 'main' });
    featureCommitHash = await createTestCommit(request, projectId, generateNodes(2), {
      branch: featureBranch,
      message: 'Edge rhythm feature child',
      parents: [baseHash],
    });
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  test('strengthens active branch edges and dims the rest on desktop selection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();
    await canvas.clickNode(featureCommitHash);

    await expect
      .poll(() => page.locator('g[data-edge-rhythm="selected"][data-edge-path-tone="branch"]').count())
      .toBeGreaterThan(0);
    await expect
      .poll(() => page.locator('g[data-edge-rhythm="dimmed"][data-edge-path-tone="branch"]').count())
      .toBeGreaterThan(0);
  });
});
