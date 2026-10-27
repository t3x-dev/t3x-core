import {
  API_BASE,
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

    const childResponse = await request.post(`${API_BASE}/conversations`, {
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

  test('keeps inherited baseline metadata and source evidence read-only', async ({ page, request }) => {
    const conversationResponse = await request.get(`${API_BASE}/conversations/${conversationId}`);
    expect(conversationResponse.ok()).toBe(true);
    expect((await conversationResponse.json()).data.parent_commit_hash).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    await page.goto(`/project/${projectId}/sources/conversations/${conversationId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByText('I want to eat Beijing roast duck.')).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByRole('heading', { name: 'Immutable turns' })).toBeVisible();
    await expect(page.getByText('Source is available')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /commit/i })).toHaveCount(0);
  });
});
