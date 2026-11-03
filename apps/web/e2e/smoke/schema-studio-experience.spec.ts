import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestProject } from '../fixtures/api-helpers';

test('Studio combines exact sources, reviews apply, and returns to active diagnostics', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const { projectId } = await createTestProject(request, `Studio journey ${randomUUID().slice(0, 8)}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
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
    await page.goto(`/project/${projectId}?tab=schemas&schemaView=studio&candidate=${candidates['t3x/prd-core']}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Schema Studio', exact: true })).toBeVisible();
    await page.getByLabel('Target Workspace').selectOption(workspaceId);
    await expect(page.getByRole('button', { name: 'Review Schema changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Manage sources', exact: true }).click();
    await page.getByRole('button', { name: 'Combine sources…', exact: true }).click();
    const composition = page.getByRole('dialog', { name: 'Combine Schema sources' });
    await composition
      .getByRole('checkbox', { name: 'Combine System Architecture @ 1.0.0' })
      .check();
    await expect(
      composition.getByRole('checkbox', { name: 'Combine PRD Core @ 1.1.0' })
    ).toBeChecked();
    await composition.getByRole('button', { name: 'Save combined candidate' }).click();
    await expect(composition).toBeHidden();
    await page.getByRole('button', { name: 'Review Schema changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review Schema changes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Change summary' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Schema review changes' })).toContainText('system_architecture');
    expect((await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data.workspace.schemaBindings).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Approve and commit', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('studio-review.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
    await expect(page.getByText('This revision is committed. Open State to inspect or export it.')).toBeVisible();
    const applied = (await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data.workspace;
    expect(applied.schemaBindings[0]).toMatchObject({ mode: 'draft_override', compositionRevision: 1 });
    expect(applied.schemaBindings[0].studioSources).toBeUndefined();
    expect(applied.schemaReview.verdict).toBe('ready');
    await page.goto(`/project/${projectId}?tab=workspaces&workspace=${workspaceId}`, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('studio-mobile.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const workspaceBox = await page.getByRole('region', { name: 'Workspace detail' }).boundingBox();
    expect(workspaceBox!.x + workspaceBox!.width).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1480, height: 960 });
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toContainText('Release planning');
    await expect(page.getByLabel('Workspace schema')).not.toHaveValue('');
    await page.screenshot({ path: testInfo.outputPath('studio-active.png'), animations: 'disabled' });
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
