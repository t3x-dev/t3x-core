import { randomUUID } from 'node:crypto';
import { AVATAR_PNG_BASE64 } from '../fixtures/avatar';
import { expect, test } from '../fixtures/test';
import { API_BASE, cleanupProject, createTestCommitFromTrees, createTestMaterial, createTestProject } from '../fixtures/api-helpers';
import { generatePrdSchemaCandidateFields } from '../fixtures/test-data-factory';

test('discover real releases, filter, inspect an exact introduction and open Studio', async ({ page, request }, testInfo) => {
  test.setTimeout(90000);
  const { projectId } = await createTestProject(request, `Catalog journey ${randomUUID().slice(0, 8)}`);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const owned = (await (await request.get(`${API_BASE}/projects/${projectId}`)).json()).data;
    expect(owned.project_id).toBe(projectId);
    const commitDigest = await createTestCommitFromTrees(request, projectId, [{ key: 'service', slots: { image: 'app:v1' }, children: [] }]);
    const base64 = AVATAR_PNG_BASE64;
    const presentationResponse = await request.post(`${API_BASE}/projects/${projectId}/commits/${encodeURIComponent(commitDigest)}/presentation`, { data: {
      description: 'Review a service definition before delivery.', readme: '# Team release guide\n\nKeep configuration changes reviewable.\n\n## Delivery\n\nReview the version before connecting your workflow.', tags: ['infrastructure'],
      resources: [{ path: 'images/overview.png', alt: 'Team supplied State overview', mediaType: 'image/png', base64 }], avatarPath: 'images/overview.png',
    } });
    expect(presentationResponse.ok(), await presentationResponse.text()).toBeTruthy();
    const presentationDigest = (await presentationResponse.json()).data.presentation.digest;
    const sourceEvidence = await createTestMaterial(request, projectId);
    const workspaceId = 'catalog-studio';
    const workspace = { id: workspaceId, projectId, title: 'Catalog Studio', targetBranch: 'main', status: 'draft', summary: 'Schema publication', updatedAt: new Date().toISOString(), baseCommitHash: commitDigest, sourceBundle: [sourceEvidence], schemaBindings: [], schemaCandidate: { summary: '', fields: generatePrdSchemaCandidateFields() }, schemaReview: { verdict: 'ready', summary: '', gaps: [] }, yopsDraft: { id: 'draft', operations: [] }, outputTargets: [] };
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
      canonical_name: canonicalName, version: '1.2.3', title: 'Team release definition', description: 'Review a service definition before delivery.', tags: ['infrastructure', 'ecosystem:t3x'], visibility: 'community', license: 'MIT',
      presentation_ref: { commitDigest, presentationDigest, coverPath: 'images/overview.png' },
    } });
    expect(published.ok(), await published.text()).toBeTruthy();
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.goto(`/explore?view=discover&type=schemas&studioTarget=${projectId}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Find a starting point.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore Team release definition' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('discover-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Explore Team release definition' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('discover-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.getByRole('link', { name: 'Browse', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Schemas', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('browse-all-desktop.png'), animations: 'disabled' });
    await page.getByRole('searchbox', { name: 'Search projects and schemas' }).fill('not-a-real-schema');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      page.getByText('No schemas match these filters. Try another topic or clear the filters.')
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('browse-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1480, height: 900 });
    await page.getByRole('searchbox', { name: 'Search projects and schemas' }).fill('Team release');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/view=browse.*q=Team\+release/);
    await expect(page.getByRole('heading', { name: 'Schemas', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('browse-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Explore Team release definition' }).last().click();
    await expect(page).toHaveURL(/catalogName=/);
    await expect(page.getByRole('heading', { name: 'Team release definition' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Definition' })).toContainText('11 declared paths');
    await page.screenshot({ path: testInfo.outputPath('release-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Use Schema', exact: true }).click();
    await page.getByLabel('Destination project', { exact: true }).selectOption(projectId);
    await page.getByRole('button', { name: 'Add & open Studio' }).click();
    await expect(page).toHaveURL(/schemaView=studio/);
    await expect(page.getByRole('region', { name: 'Schema Studio', exact: true })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Available Schema sources' })).toContainText('Team release definition');
    const candidates = (await (await request.get(`${API_BASE}/projects/${projectId}/schema-studio/candidates`)).json()).data.items;
    expect(candidates.some((item: { source?: { canonicalName?: string; version?: string } }) => item.source?.canonicalName === canonicalName && item.source.version === '1.2.3')).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('studio-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('studio-mobile.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  } finally { await cleanupProject(request, projectId); }
});
