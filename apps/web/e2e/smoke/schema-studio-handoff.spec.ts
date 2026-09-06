import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getProjectRepoPath } from '../../src/domain/project/repoPath';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestProject } from '../fixtures/api-helpers';

test('add a pinned source from Overview to another project Studio without changing Workspaces', async ({ page, request }, testInfo) => {
  test.setTimeout(90000);
  const { projectId } = await createTestProject(request, `Catalog journey ${randomUUID().slice(0, 8)}`);
  const destination = await createTestProject(request, `Studio destination ${randomUUID().slice(0, 8)}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const owned = (await (await request.get(`${API_BASE}/projects/${projectId}`)).json()).data;
    expect(owned.project_id).toBe(projectId);
    const projectPath = getProjectRepoPath({ id: owned.project_id, name: owned.name });
    const commitDigest = await createTestCommitFromTrees(request, projectId, [{ key: 'service', slots: { image: 'app:v1' }, children: [] }]);
    const base64 = readFileSync('../../docs/plans/state-schema-delivery-2026-09-05/verification/state-overview/desktop.png').toString('base64');
    const presentationResponse = await request.post(`${API_BASE}/projects/${projectId}/commits/${encodeURIComponent(commitDigest)}/presentation`, { data: {
      description: 'Review a service definition before delivery.', readme: '# Team release guide\n\nKeep configuration changes reviewable.\n\n## Delivery\n\nReview the version before connecting your workflow.', tags: ['infrastructure'],
      resources: [{ path: 'images/overview.png', alt: 'Team supplied State overview', mediaType: 'image/png', base64 }], avatarPath: 'images/overview.png',
    } });
    expect(presentationResponse.ok(), await presentationResponse.text()).toBeTruthy();
    const presentationDigest = (await presentationResponse.json()).data.presentation.digest;
    const workspaceId = 'catalog-studio';
    const workspace = { id: workspaceId, projectId, title: 'Catalog Studio', targetBranch: 'main', status: 'draft', summary: 'Schema publication', updatedAt: new Date().toISOString(), baseCommitHash: commitDigest, sourceBundle: [], schemaBindings: [], schemaCandidate: { summary: '', fields: [] }, schemaReview: { verdict: 'ready', summary: '', gaps: [] }, yopsDraft: { id: 'draft', operations: [] }, outputTargets: [] };
    const saved = await request.patch(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`, { data: { workspace } });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const revision = (await saved.json()).data.workspace.revision;
    const composition = { apiVersion: 't3x.dev/yschema-composition/v2', id: 'catalog-composition', revision: 0, status: 'draft', modules: [{ canonicalName: 't3x/prd-core', version: '1.1.0', presentationOrder: 10 }] };
    const compositionResponse = await request.put(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}/schema-composition`, { data: { composition, if_revision: revision } });
    expect(compositionResponse.ok(), await compositionResponse.text()).toBeTruthy();
    const compiled = (await compositionResponse.json()).data;
    const canonicalName = `catalog-${projectId.toLowerCase().replace(/[^a-z0-9]/g, '')}/release`;
    const published = await request.post(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}/schema-composition/publish`, { data: {
      composition_revision: compiled.composition.revision, composition_hash: compiled.preview.compositionHash,
      canonical_name: canonicalName, version: '1.2.3', title: 'Team release definition', description: 'Review a service definition before delivery.', tags: ['infrastructure', 'ecosystem:t3x'],
      presentation_ref: { commitDigest, presentationDigest, coverPath: 'images/overview.png' },
    } });
    expect(published.ok(), await published.text()).toBeTruthy();
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.goto(`${projectPath}/schemas`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Explore Team release definition 1.2.3' }).click();
    await page.getByRole('link', { name: 'Project introduction' }).click();
    await expect(page.getByTestId('state-overview')).toBeVisible();
    await page.getByRole('button', { name: 'Add to Studio', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Add to Studio' });
    await drawer.getByLabel('Destination project').selectOption(destination.projectId);
    await expect(drawer.getByRole('button', { name: 'Add & open Studio' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('handoff-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('handoff-mobile.png'), animations: 'disabled' });
    await drawer.getByRole('button', { name: 'Add & keep browsing' }).click();
    await expect(drawer).not.toBeVisible();
    const candidates = (await (await request.get(`${API_BASE}/projects/${destination.projectId}/schema-studio/candidates`)).json()).data.items;
    expect(candidates).toHaveLength(1); expect(candidates[0].source).toMatchObject({ projectId, version: '1.2.3' });
    const before = (await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data;
    await page.getByRole('button', { name: 'Add to Studio', exact: true }).click();
    await drawer.getByLabel('Destination project').selectOption(destination.projectId);
    await expect(drawer.getByText('Saved as a candidate')).toBeVisible();
    await drawer.getByRole('button', { name: 'Open Studio', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Saved Studio candidates' })).toContainText('Team release definition');
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.screenshot({ path: testInfo.outputPath('candidates-desktop.png'), animations: 'disabled' });
    expect((await (await request.get(`${API_BASE}/projects/${destination.projectId}/schema-studio/candidates`)).json()).data.items).toHaveLength(1);
    expect((await (await request.get(`${API_BASE}/projects/${projectId}/workspaces/${workspaceId}`)).json()).data).toEqual(before);
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, destination.projectId); await cleanupProject(request, projectId); }
});
