import { API_BASE, cleanupProject, createTestConversation, createTestProject } from '../fixtures/api-helpers';
import { CanvasPage } from '../fixtures/page-objects/canvas-page';
import { expect, test } from '../fixtures/test';

test.describe('Canvas pending deletion', () => {
  test('deletes staging and draft nodes without leaving the canvas', async ({ page, request }) => {
    test.setTimeout(60_000);
    const runId = Date.now();
    const conversationTitle = `Pending delete ${runId}`;
    const draftTitle = `Draft delete ${runId}`;
    const { projectId } = await createTestProject(request, `Canvas delete ${runId}`);

    try {
      const conversationId = await createTestConversation(request, projectId, conversationTitle);
      const createDraftResponse = await request.post(`${API_BASE}/drafts`, {
        data: { project_id: projectId, title: draftTitle },
      });
      expect(createDraftResponse.status()).toBe(201);
      const createDraftBody = await createDraftResponse.json();
      const draftId = createDraftBody.data.id as string;

      const canvas = new CanvasPage(page);
      await canvas.goto(projectId);
      await canvas.waitForLoad();

      const initialLocation = new URL(page.url());
      const initialPath = `${initialLocation.pathname}${initialLocation.search}`;
      const conversationNode = page
        .locator('[data-node-type="conversation"]')
        .filter({ hasText: conversationTitle });
      const draftNode = page.locator('[data-node-type="draft"]').filter({ hasText: draftTitle });
      const conversationFlowNode = page
        .locator('.react-flow__node')
        .filter({ has: conversationNode });
      const draftFlowNode = page.locator('.react-flow__node').filter({ has: draftNode });

      await expect(conversationNode).toBeVisible({ timeout: 15_000 });
      await expect(draftNode).toBeVisible({ timeout: 15_000 });

      // Selecting a pending node must not route to the legacy conversation page.
      await conversationNode.click({ position: { x: 20, y: 60 } });
      await expect.poll(() => {
        const location = new URL(page.url());
        return `${location.pathname}${location.search}`;
      }).toBe(initialPath);

      await conversationFlowNode.click({ button: 'right', position: { x: 20, y: 20 } });
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.getByRole('heading', { name: 'Confirm Deletion' })).toBeVisible();

      const conversationDeleteResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response.url().endsWith(`/api/v1/conversations/${conversationId}`)
      );
      const conversationCanvasReload = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.url().includes(`/api/v1/drafts?project_id=${projectId}`)
      );
      await page.getByRole('button', { name: /^Delete(?: \(\d+\))?$/ }).click();
      expect((await conversationDeleteResponse).status()).toBe(200);
      expect((await conversationCanvasReload).status()).toBe(200);

      await expect.poll(async () => (await request.get(`${API_BASE}/conversations/${conversationId}`)).status()).toBe(404);
      await expect(conversationNode).toHaveCount(0);
      expect(`${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(initialPath);

      await expect(draftFlowNode).toBeVisible();
      await draftFlowNode.click({ button: 'right', position: { x: 20, y: 20 } });
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(page.getByRole('heading', { name: 'Confirm Deletion' })).toBeVisible();

      const draftDeleteResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response.url().endsWith(`/api/v1/drafts/${draftId}`)
      );
      const draftCanvasReload = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.url().includes(`/api/v1/drafts?project_id=${projectId}`)
      );
      await page.getByRole('button', { name: /^Delete(?: \(\d+\))?$/ }).click();
      expect((await draftDeleteResponse).status()).toBe(200);
      expect((await draftCanvasReload).status()).toBe(200);

      await expect.poll(async () => (await request.get(`${API_BASE}/drafts/${draftId}`)).status()).toBe(404);
      await expect(draftNode).toHaveCount(0);
      expect(`${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(initialPath);

      // Persistence check: both nodes remain absent after a full page reload.
      await page.reload();
      await canvas.waitForLoad();
      await expect(page.locator('[data-node-type="conversation"]').filter({ hasText: conversationTitle })).toHaveCount(0);
      await expect(page.locator('[data-node-type="draft"]').filter({ hasText: draftTitle })).toHaveCount(0);
      expect(`${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(initialPath);
    } finally {
      await cleanupProject(request, projectId).catch(() => {});
    }
  });
});
