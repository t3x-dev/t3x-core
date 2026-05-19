import {
  cleanupProject,
  createTestCommit,
  createTestConversation,
  createTestLeaf,
  createTestProject,
  createTestTurn,
} from '../fixtures/api-helpers';
import { CanvasPage } from '../fixtures/page-objects/canvas-page';
import { expect, test } from '../fixtures/test';
import { generateNodes } from '../fixtures/test-data-factory';

test.describe('Canvas grayscale readability', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let commitHash: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Canvas Grayscale ${Date.now()}`));
    commitHash = await createTestCommit(request, projectId, generateNodes(2), {
      message: 'Committed marker fixture',
    });
    await createTestLeaf(request, commitHash, projectId);

    const conversationId = await createTestConversation(
      request,
      projectId,
      'Pending marker fixture'
    );
    await createTestTurn(request, projectId, conversationId, 'user', 'Pending unit source text.');
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  test('keeps source, pending, committed, and leaf markers visible without color', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const canvas = new CanvasPage(page);
    await canvas.goto(projectId);
    await canvas.waitForLoad();

    await expect(page.getByTestId('node-kind-source').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('node-kind-pending').first()).toBeVisible();
    await expect(page.getByTestId('node-kind-committed').first()).toBeVisible();
    await expect(page.getByTestId('node-kind-leaf').first()).toBeVisible();

    await page.addStyleTag({
      content: 'html { filter: grayscale(1) !important; }',
    });

    await testInfo.attach('desktop-canvas-grayscale', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });
});
