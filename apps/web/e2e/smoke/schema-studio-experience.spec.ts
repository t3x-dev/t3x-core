import { randomUUID } from 'node:crypto';
import { getProjectRepoPath } from '../../src/domain/project/repoPath';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';

test('Studio compares modules, reviews exact apply, invalidates a stale review, and returns to active diagnostics', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const { projectId } = await createTestProject(request, `Studio journey ${randomUUID().slice(0, 8)}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const owned = (await (await request.get(`${API_BASE}/projects/${projectId}`)).json()).data;
    const projectPath = getProjectRepoPath({ id: owned.project_id, name: owned.name });
    const workspaceId = 'studio-target';
    const workspace = { id: workspaceId, projectId, title: 'Release planning', targetBranch: 'main', status: 'draft', summary: 'Prepare our product release', updatedAt: new Date().toISOString(), baseCommitHash: null, sourceBundle: [], schemaBindings: [], schemaCandidate: { summary: '', fields: [] }, schemaReview: { verdict: 'ready', summary: '', gaps: [] }, yopsDraft: { id: 'draft', operations: [] }, outputTargets: [] };
    const saved = await request.patch(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`, { data: { workspace } });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const candidates: Record<string, string> = {};
    for (const [canonicalName, version] of [['t3x/prd-core', '1.1.0'], ['t3x/prd-system-architecture', '1.0.0'], ['t3x/prd-technology-stack', '1.0.0']]) {
      const response = await request.post(`${API_BASE}/projects/${projectId}/schema-studio/candidates`, { data: { canonicalName, version } });
      expect(response.ok(), await response.text()).toBeTruthy();
      candidates[canonicalName!] = (await response.json()).data.id;
    }
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(`${projectPath}/schemas?schemaView=studio&candidate=${candidates['t3x/prd-core']}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Definition preview' })).toBeVisible();
    await page.getByLabel('Target Workspace').selectOption(workspaceId);
    await expect(page.getByRole('button', { name: 'Review & apply', exact: true })).toBeEnabled();
    // Legacy V1 requires are suggestions in open V2 composition, not mandatory locks.
    await page.getByRole('checkbox', { name: 'Select Technology Stack 1.0.0' }).check();
    await expect(page.getByRole('button', { name: 'Review & apply', exact: true })).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Select System Architecture 1.0.0' }).check();
    await expect(page.getByRole('button', { name: 'Review & apply', exact: true })).toBeEnabled();
    await expect(page.getByRole('checkbox', { name: 'Select System Architecture 1.0.0' })).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Select Technology Stack 1.0.0' }).uncheck();
    await page.getByLabel('Compare with').selectOption(candidates['t3x/prd-core']!);
    await expect(page.getByText(/Comparison ·/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('studio-desktop.png'), animations: 'disabled' });
    await page.getByLabel('X-ray').check();
    await page.getByRole('button', { name: 'code', exact: true }).click();
    await expect(page.locator('pre')).toContainText('system_architecture');
    await page.getByRole('button', { name: 'preview', exact: true }).click();
    await page.getByRole('button', { name: 'Review & apply', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Apply exact definition' });
    await expect(dialog).toContainText('Release planning');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data.workspace.schemaBindings).toHaveLength(0);
    // Advance the target after Review. The backend, not a cached green card, decides whether Apply is valid.
    await page.getByRole('button', { name: 'Review & apply', exact: true }).click();
    const current = (await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data.workspace;
    const changed = await request.patch(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`, { data: { workspace: { ...current, summary: 'Concurrent edit' }, if_revision: current.revision } });
    expect(changed.ok(), await changed.text()).toBeTruthy();
    await expect(dialog.getByRole('button', { name: 'Confirm & apply' })).toBeDisabled();
    await expect(dialog.getByRole('alert')).toContainText('Workspace or selection changed');
    await dialog.getByRole('button', { name: 'Refresh review' }).click();
    await expect(dialog.getByRole('button', { name: 'Confirm & apply' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('studio-review.png'), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Confirm & apply' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Exact definition applied' })).toBeVisible();
    const applied = (await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data.workspace;
    expect(applied.schemaBindings[0]).toMatchObject({ mode: 'pinned', compositionRevision: 1 });
    expect(applied.schemaBindings[0].studioSources).toHaveLength(2);
    expect(applied.schemaReview.verdict).toBe('needs_review');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('studio-mobile.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(`${projectPath}/schemas`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Active schema bindings' })).toContainText('Release planning');
    await expect(page.getByRole('region', { name: 'Active schema bindings' })).toContainText('Needs review');
    await page.screenshot({ path: testInfo.outputPath('studio-active.png'), animations: 'disabled' });
    await page.getByRole('link', { name: 'Open Workspace review & history' }).click();
    await expect(page).toHaveURL(/workspaces|tab=workspaces/);
    await page.goto(`${projectPath}/schemas`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Active schema bindings' })).toContainText(`revision ${applied.revision}`);
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
