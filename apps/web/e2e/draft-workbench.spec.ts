import { API_BASE, cleanupProject, createTestProject } from './fixtures/api-helpers';
import { expect, test } from './fixtures/test';

// The workbench Draft page and write API were retired. Active composition and
// commit coverage lives in flows/workspace-complex-flow.spec.ts.
test('retired Draft workbench does not expose a writable editor', async ({ page, request }) => {
  const { projectId } = await createTestProject(request, `Retired Draft ${Date.now()}`);
  try {
    const response = await request.post(`${API_BASE}/drafts`, {
      data: { project_id: projectId, title: 'Retired draft' },
    });
    expect(response.status()).toBe(404);
    await page.goto(`/project/${projectId}/draft/retired-draft`);
    await expect(page.getByText('404', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate Preview|Commit/ })).toHaveCount(0);
    const project = await request.get(`${API_BASE}/projects/${projectId}`);
    expect(project.ok()).toBe(true);
  } finally {
    await cleanupProject(request, projectId);
  }
});
