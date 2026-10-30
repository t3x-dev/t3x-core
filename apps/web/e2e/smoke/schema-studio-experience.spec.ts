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
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Manage sources', exact: true }).click();
    // Legacy V1 requires are suggestions in open V2 composition, not mandatory locks.
    await page.getByRole('checkbox', { name: 'Select Technology Stack for combination' }).check();
    await page.getByRole('checkbox', { name: 'Select System Architecture for combination' }).check();
    await expect(page.getByRole('checkbox', { name: 'Select System Architecture for combination' })).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Select Technology Stack for combination' }).uncheck();
    await page.getByRole('button', { name: 'Combine selected…', exact: true }).click();
    await page.getByRole('button', { name: 'Save combined draft', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data.workspace.schemaBindings).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath('studio-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Schema actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Edit YAML…', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download YAML', exact: true }).click();
    const stream = await (await download).createReadStream();
    let yaml = '';
    for await (const chunk of stream!) yaml += chunk.toString();
    expect(yaml).toContain('system_architecture');
    await page.getByRole('dialog', { name: 'Schema YAML editor' }).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Workspace Review' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Schema review' })).toContainText('system_architecture');
    await expect(page.getByRole('button', { name: 'Approve and commit' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('studio-review.png'), animations: 'disabled' });
    await page.getByRole('link', { name: 'Edit in Compose', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toBeVisible();
    const applied = (await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data.workspace;
    expect(applied.schemaBindings[0]).toMatchObject({ mode: 'draft_override', compositionRevision: 1 });
    const candidate = (await (await request.get(`${API_BASE}/projects/${projectId}/schema-studio/edit-candidates/${workspaceId}`)).json()).data;
    expect(candidate.baseSources.map((source: { canonicalName: string; version: string }) => `${source.canonicalName}@${source.version}`).sort()).toEqual(['t3x/prd-core@1.1.0', 't3x/prd-system-architecture@1.0.0']);
    const draft = (await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}/authoring`)).json()).data;
    expect(draft.currentSchema.definition.nodes).toHaveProperty('system_architecture');
    expect(draft.currentSchema.schemaHash).toBe(applied.schemaBindings[0].schemaHash);
    expect(applied.schemaReview.verdict).toBe('ready');
    expect(applied.baseCommitHash).toBeNull();
    expect(applied.lastCommitHash ?? null).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('studio-mobile.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const workspaceBox = await page.getByRole('region', { name: 'Workspace detail' }).boundingBox();
    expect(workspaceBox!.x + workspaceBox!.width).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1480, height: 960 });
    await page.goto(`/project/${projectId}?tab=workspaces&workspace=${workspaceId}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toContainText('Release planning');
    await page.getByRole('navigation', { name: 'Workspace tools' }).getByRole('button', { name: 'Structure', exact: true }).click();
    await expect(page.getByLabel('Workspace schema')).not.toHaveValue('');
    await page.screenshot({ path: testInfo.outputPath('studio-active.png'), animations: 'disabled' });
    await expect(page.getByRole('region', { name: 'Workspace detail' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
