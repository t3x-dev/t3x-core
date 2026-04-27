import {
  cleanupProject,
  createTestCommit,
  createTestProject,
  createTestTurn,
} from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

test.describe('Inherited baseline workspace state', () => {
  let projectId: string;
  let conversationId: string;

  test.beforeAll(async ({ request }) => {
    ({ projectId } = await createTestProject(request, `Inherited Baseline E2E ${Date.now()}`));

    const parentCommitHash = await createTestCommit(
      request,
      projectId,
      [{ id: 'food_preferences', text: 'desired_food: chestnuts' }],
      { message: 'Parent food preferences' }
    );

    const childResponse = await request.post('http://localhost:8000/api/v1/conversations', {
      data: {
        project_id: projectId,
        title: 'Child with parent only',
        parent_commit_hash: parentCommitHash,
      },
    });
    const childBody = await childResponse.json();
    expect(childBody.success).toBe(true);
    conversationId = childBody.data.conversation_id as string;

    await createTestTurn(
      request,
      projectId,
      conversationId,
      'user',
      'I want to eat Beijing roast duck.'
    );
    await createTestTurn(
      request,
      projectId,
      conversationId,
      'assistant',
      'The common English term is Peking duck.'
    );
  });

  test.afterAll(async ({ request }) => {
    if (projectId) await cleanupProject(request, projectId).catch(() => {});
  });

  test('labels parent-only replay as inherited baseline and blocks commit', async ({ page }) => {
    await page.goto(`/chat/${conversationId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('I want to eat Beijing roast duck.')).toBeVisible({
      timeout: 10_000,
    });

    const afterPanel = page.getByTestId('after-panel');
    await expect(afterPanel).toBeVisible({ timeout: 10_000 });
    await expect(afterPanel).toContainText('Inherited baseline', { timeout: 10_000 });
    await expect(afterPanel).toContainText('Parent');
    await expect(page.locator('text=Inherited baseline').first()).toBeVisible();
    await expect(page.getByTestId('commit-button')).toBeDisabled();
  });
});
