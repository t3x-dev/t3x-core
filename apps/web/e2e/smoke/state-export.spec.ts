import { load } from 'js-yaml';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';

test('State and historical Commit expose the selected exact export value', async ({ page, request }) => {
  const { projectId } = await createTestProject(request, 'Exact State exports');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const first = await createTestCommitFromTrees(request, projectId, [{ key: 'service', slots: { image: 'app:v1' }, children: [] }], { message: 'Original configuration' });
    const latest = await createTestCommitFromTrees(request, projectId, [{ key: 'service', slots: { image: 'app:v2' }, children: [] }], { message: 'Updated configuration' });
    await page.goto(`/project/${projectId}`);
    await expect(page.getByText('Updated configuration', { exact: true })).toBeVisible();
    const currentResponse = await request.get(`${API_BASE}/commits/${encodeURIComponent(latest)}/export?project_id=${projectId}&format=yaml`);
    const currentBytes = (await currentResponse.json()).data.content as string;
    expect(currentBytes).toContain('app:v2');
    await page.goto(`/project/${projectId}/history`);
    await page.getByRole('button').filter({ hasText: 'Original configuration' }).click();
    await expect(page.getByRole('heading', { name: 'Original configuration', exact: true })).toBeVisible();
    const response = await request.get(`${API_BASE}/commits/${encodeURIComponent(first)}/export?project_id=${projectId}&format=json`);
    const { data } = await response.json();
    expect(JSON.stringify(load(data.content))).toContain('app:v1');
    expect(data.content).not.toContain('app:v2');
    expect(errors).toEqual([]);
  } finally {
    await cleanupProject(request, projectId);
  }
});
